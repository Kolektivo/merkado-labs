-- Labs geospatial foundation for property listings and neighbourhood boundaries.
-- Forward-only migration. Does not modify or delete prior migrations.
-- Target project: csaefdkpwukshtouyixg (merkado-labs).

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Neighbourhood boundary metadata and geometry
-- ---------------------------------------------------------------------------

alter table public.neighbourhoods
    add column if not exists boundary extensions.geography(MultiPolygon, 4326),
    add column if not exists boundary_source_name text,
    add column if not exists boundary_source_url text,
    add column if not exists boundary_licence text,
    add column if not exists boundary_imported_at timestamptz,
    add column if not exists boundary_external_id text,
    add column if not exists is_gap_zone boolean not null default false;

alter table public.neighbourhoods
    drop constraint if exists neighbourhoods_boundary_metadata_check;

alter table public.neighbourhoods
    add constraint neighbourhoods_boundary_metadata_check
    check (
        (
            boundary is null
            and boundary_source_name is null
            and boundary_source_url is null
            and boundary_licence is null
            and boundary_imported_at is null
            and boundary_external_id is null
        )
        or (
            boundary is not null
            and boundary_source_name is not null
            and btrim(boundary_source_name) <> ''
            and boundary_source_url is not null
            and btrim(boundary_source_url) <> ''
            and boundary_licence is not null
            and btrim(boundary_licence) <> ''
            and boundary_imported_at is not null
            and boundary_external_id is not null
            and btrim(boundary_external_id) <> ''
        )
    );

create unique index if not exists neighbourhoods_boundary_external_id_uidx
    on public.neighbourhoods (boundary_external_id)
    where boundary_external_id is not null;

create index if not exists neighbourhoods_boundary_gix
    on public.neighbourhoods
    using gist (boundary)
    where boundary is not null;

create index if not exists neighbourhoods_is_gap_zone_idx
    on public.neighbourhoods (is_gap_zone);

comment on column public.neighbourhoods.boundary is
    'Authoritative Curaçao neighbourhood or gap-zone multipolygon in WGS84.';
comment on column public.neighbourhoods.boundary_external_id is
    'Stable identifier from the boundary dataset (CBS/MDC zone id).';
comment on column public.neighbourhoods.is_gap_zone is
    'True for uninhabited gap polygons; excluded from neighbourhood assignment.';

-- ---------------------------------------------------------------------------
-- Listing geographic point + non-destructive assignment metadata
-- ---------------------------------------------------------------------------

alter table public.property_listings
    add column if not exists location extensions.geography(Point, 4326)
        generated always as (
            case
                when latitude is not null and longitude is not null then
                    extensions.st_setsrid(
                        extensions.st_makepoint(longitude, latitude),
                        4326
                    )::extensions.geography
                else null
            end
        ) stored;

alter table public.property_listings
    add column if not exists inferred_neighbourhood_id uuid
        references public.neighbourhoods (id) on delete set null,
    add column if not exists neighbourhood_assignment_status text
        not null default 'unprocessed',
    add column if not exists neighbourhood_assignment_method text,
    add column if not exists neighbourhood_assigned_at timestamptz,
    add column if not exists neighbourhood_assignment_confidence numeric;

alter table public.property_listings
    drop constraint if exists property_listings_neighbourhood_assignment_status_check;

alter table public.property_listings
    add constraint property_listings_neighbourhood_assignment_status_check
    check (
        neighbourhood_assignment_status in (
            'unprocessed',
            'missing_coords',
            'invalid_coords',
            'outside_curacao',
            'outside_polygons',
            'inferred',
            'matched',
            'conflict',
            'source_only'
        )
    );

alter table public.property_listings
    drop constraint if exists property_listings_neighbourhood_assignment_method_check;

alter table public.property_listings
    add constraint property_listings_neighbourhood_assignment_method_check
    check (
        neighbourhood_assignment_method is null
        or neighbourhood_assignment_method in (
            'source',
            'point_in_polygon',
            'point_in_polygon_match',
            'point_in_polygon_conflict'
        )
    );

alter table public.property_listings
    drop constraint if exists property_listings_neighbourhood_assignment_confidence_check;

alter table public.property_listings
    add constraint property_listings_neighbourhood_assignment_confidence_check
    check (
        neighbourhood_assignment_confidence is null
        or (
            neighbourhood_assignment_confidence >= 0
            and neighbourhood_assignment_confidence <= 1
        )
    );

create index if not exists property_listings_location_gix
    on public.property_listings
    using gist (location)
    where location is not null;

create index if not exists property_listings_inferred_neighbourhood_id_idx
    on public.property_listings (inferred_neighbourhood_id);

create index if not exists property_listings_neighbourhood_assignment_status_idx
    on public.property_listings (neighbourhood_assignment_status);

comment on column public.property_listings.location is
    'Generated WGS84 geography point from latitude/longitude; source lat/lng remain authoritative.';
comment on column public.property_listings.neighbourhood_id is
    'Source-provided neighbourhood reference. Geographic backfill never overwrites this silently.';
comment on column public.property_listings.inferred_neighbourhood_id is
    'Neighbourhood matched by point-in-polygon against verified boundaries.';
comment on column public.property_listings.neighbourhood_assignment_status is
    'Traceable geographic assignment outcome relative to source neighbourhood and boundaries.';

-- ---------------------------------------------------------------------------
-- Read-only helper for coordinate quality audits (no writes)
-- ---------------------------------------------------------------------------

create or replace function public.listing_coordinate_quality(
    p_latitude double precision,
    p_longitude double precision
)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
    select case
        when p_latitude is null or p_longitude is null then 'missing_coords'
        when p_latitude < -90 or p_latitude > 90
            or p_longitude < -180 or p_longitude > 180 then 'invalid_coords'
        -- Approximate Curaçao bounding box used as a guard only.
        when p_latitude < 11.90 or p_latitude > 12.50
            or p_longitude < -69.30 or p_longitude > -68.60 then 'outside_curacao'
        else 'valid_curacao'
    end;
$$;

revoke all on function public.listing_coordinate_quality(double precision, double precision)
    from public, anon, authenticated;
grant execute on function public.listing_coordinate_quality(double precision, double precision)
    to anon, authenticated, service_role;

comment on function public.listing_coordinate_quality(double precision, double precision) is
    'Bounding-box coordinate quality guard. Point-in-polygon assignment remains authoritative.';
