-- Enrich CHH listings with original-realtor attribution and richer source fields.
-- Labs only. Forward-only additive change. No production. No destructive ops.

-- Denormalized realtor attribution on each source listing (CHH remains aggregator).
alter table public.property_listings
    add column if not exists original_realtor_name text,
    add column if not exists original_realtor_domain text,
    add column if not exists original_realtor_external_id text,
    add column if not exists original_realtor_filter_slug text,
    add column if not exists attribution_method text,
    add column if not exists attribution_observed_at timestamptz,
    add column if not exists source_listing_status text,
    add column if not exists description text,
    add column if not exists street text,
    add column if not exists house_number text,
    add column if not exists resort text,
    add column if not exists lot_area_value numeric,
    add column if not exists lot_area_unit text,
    add column if not exists amenities jsonb not null default '[]'::jsonb,
    add column if not exists coordinates_source text,
    add column if not exists chh_internal_id text,
    add column if not exists field_provenance jsonb not null default '{}'::jsonb,
    add column if not exists data_completeness_score smallint
        check (
            data_completeness_score is null
            or data_completeness_score between 0 and 100
        );

alter table public.property_listings
    drop constraint if exists property_listings_amenities_is_array;
alter table public.property_listings
    add constraint property_listings_amenities_is_array
    check (jsonb_typeof(amenities) = 'array');

alter table public.property_listings
    drop constraint if exists property_listings_field_provenance_is_object;
alter table public.property_listings
    add constraint property_listings_field_provenance_is_object
    check (jsonb_typeof(field_provenance) = 'object');

alter table public.property_listings
    drop constraint if exists property_listings_lot_area_nonnegative;
alter table public.property_listings
    add constraint property_listings_lot_area_nonnegative
    check (lot_area_value is null or lot_area_value >= 0);

create index if not exists property_listings_original_realtor_name_idx
    on public.property_listings (original_realtor_name);

create index if not exists property_listings_original_realtor_domain_idx
    on public.property_listings (original_realtor_domain);

create index if not exists property_listings_original_realtor_external_id_idx
    on public.property_listings (property_source_id, original_realtor_external_id);

create index if not exists property_listings_source_listing_status_idx
    on public.property_listings (source_listing_status);

create index if not exists property_listings_amenities_gin_idx
    on public.property_listings using gin (amenities);

-- Field-level conflicts between aggregator evidence and optional original-source enrichment.
-- Never silently overwrite stronger evidence; record both sides here.
create table if not exists public.listing_field_conflicts (
    id uuid primary key default gen_random_uuid(),
    property_listing_id uuid not null references public.property_listings(id) on delete cascade,
    field_name text not null,
    aggregator_value jsonb,
    original_source_value jsonb,
    aggregator_source_name text not null default 'CaribbeanHouseHunt.com',
    original_source_name text,
    original_source_url text,
    discovery_method text not null,
    observed_at timestamptz not null,
    resolution_status text not null default 'unresolved'
        check (resolution_status in ('unresolved', 'prefer_aggregator', 'prefer_original', 'reviewed')),
    notes text,
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    constraint listing_field_conflicts_resolution_order_check
        check (resolved_at is null or resolved_at >= created_at)
);

create index if not exists listing_field_conflicts_listing_idx
    on public.listing_field_conflicts (property_listing_id, observed_at desc);

create index if not exists listing_field_conflicts_unresolved_idx
    on public.listing_field_conflicts (created_at)
    where resolution_status = 'unresolved';

alter table public.listing_field_conflicts enable row level security;

revoke all on table public.listing_field_conflicts from anon, authenticated;

-- Publishable dashboard may see conflict summaries (no raw operational secrets).
grant select on table public.listing_field_conflicts to anon, authenticated;

create policy listing_field_conflicts_anon_select
    on public.listing_field_conflicts
    for select
    to anon, authenticated
    using (true);
