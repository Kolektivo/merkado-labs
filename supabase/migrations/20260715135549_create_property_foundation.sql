create extension if not exists pgcrypto with schema extensions;

create table public.property_sources (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    base_url text not null unique,
    created_at timestamptz not null default now()
);

create table public.neighbourhoods (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    normalized_name text not null unique,
    slug text not null unique,
    created_at timestamptz not null default now()
);

create table public.property_assets (
    id uuid primary key default gen_random_uuid(),
    neighbourhood_id uuid references public.neighbourhoods(id) on delete set null,
    property_type text,
    latitude double precision check (latitude between -90 and 90),
    longitude double precision check (longitude between -180 and 180),
    floor_area_m2 numeric check (floor_area_m2 > 0),
    bedrooms smallint check (bedrooms >= 0),
    review_status text not null default 'pending'
        check (review_status in ('pending', 'reviewed', 'rejected')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.property_listings (
    id uuid primary key default gen_random_uuid(),
    property_source_id uuid not null references public.property_sources(id),
    property_asset_id uuid references public.property_assets(id) on delete set null,
    external_id text not null,
    external_id_status text not null default 'provisional'
        check (external_id_status in ('provisional', 'verified', 'rejected')),
    source_url text not null,
    original_realtor_url text,
    listing_type text,
    property_type text,
    title text,
    current_price numeric check (current_price >= 0),
    currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
    bedrooms smallint check (bedrooms >= 0),
    floor_area_m2 numeric check (floor_area_m2 > 0),
    neighbourhood_id uuid references public.neighbourhoods(id) on delete set null,
    latitude double precision check (latitude between -90 and 90),
    longitude double precision check (longitude between -180 and 180),
    primary_image_url text,
    status text not null default 'active'
        check (status in ('active', 'inactive', 'removed', 'unknown')),
    observation_count integer not null default 0 check (observation_count >= 0),
    price_observation_count integer not null default 0 check (price_observation_count >= 0),
    first_seen_at timestamptz not null,
    last_seen_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint property_listings_source_external_id_key
        unique (property_source_id, external_id),
    constraint property_listings_seen_order_check
        check (last_seen_at >= first_seen_at)
);

create table public.listing_observations (
    id uuid primary key default gen_random_uuid(),
    property_listing_id uuid not null references public.property_listings(id),
    observed_at timestamptz not null,
    source_snapshot_id text not null,
    source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
    raw_payload jsonb not null,
    normalized_payload jsonb not null,
    created_at timestamptz not null default now(),
    constraint listing_observations_listing_snapshot_key
        unique (property_listing_id, source_snapshot_id)
);

create table public.price_observations (
    id uuid primary key default gen_random_uuid(),
    property_listing_id uuid not null references public.property_listings(id),
    observed_at timestamptz not null,
    price numeric not null check (price >= 0),
    currency text not null check (currency ~ '^[A-Z]{3}$'),
    created_at timestamptz not null default now(),
    constraint price_observations_natural_key
        unique (property_listing_id, observed_at, price, currency)
);

create table public.ingestion_quarantine (
    id uuid primary key default gen_random_uuid(),
    property_source_id uuid references public.property_sources(id),
    external_id text,
    reason text not null,
    raw_payload jsonb not null,
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    constraint ingestion_quarantine_resolution_check
        check (resolved_at is null or resolved_at >= created_at)
);

create index property_assets_neighbourhood_id_idx
    on public.property_assets (neighbourhood_id);
create index property_listings_property_asset_id_idx
    on public.property_listings (property_asset_id);
create index property_listings_neighbourhood_id_idx
    on public.property_listings (neighbourhood_id);
create index listing_observations_listing_observed_idx
    on public.listing_observations (property_listing_id, observed_at desc);
create index price_observations_listing_observed_idx
    on public.price_observations (property_listing_id, observed_at desc);
create index ingestion_quarantine_unresolved_idx
    on public.ingestion_quarantine (created_at)
    where resolved_at is null;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger property_assets_set_updated_at
before update on public.property_assets
for each row execute function public.set_updated_at();

create trigger property_listings_set_updated_at
before update on public.property_listings
for each row execute function public.set_updated_at();

create function public.prevent_observation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception '% rows are immutable; append a new observation', tg_table_name;
end;
$$;

create trigger listing_observations_are_immutable
before update or delete on public.listing_observations
for each row execute function public.prevent_observation_mutation();

create trigger price_observations_are_immutable
before update or delete on public.price_observations
for each row execute function public.prevent_observation_mutation();

create function public.increment_listing_observation_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    update public.property_listings
    set observation_count = observation_count + 1
    where id = new.property_listing_id;
    return new;
end;
$$;

create trigger listing_observations_increment_count
after insert on public.listing_observations
for each row execute function public.increment_listing_observation_count();

create function public.increment_price_observation_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    update public.property_listings
    set price_observation_count = price_observation_count + 1
    where id = new.property_listing_id;
    return new;
end;
$$;

create trigger price_observations_increment_count
after insert on public.price_observations
for each row execute function public.increment_price_observation_count();

alter table public.property_sources enable row level security;
alter table public.neighbourhoods enable row level security;
alter table public.property_assets enable row level security;
alter table public.property_listings enable row level security;
alter table public.listing_observations enable row level security;
alter table public.price_observations enable row level security;
alter table public.ingestion_quarantine enable row level security;

revoke all on table public.property_sources from anon, authenticated;
revoke all on table public.neighbourhoods from anon, authenticated;
revoke all on table public.property_assets from anon, authenticated;
revoke all on table public.property_listings from anon, authenticated;
revoke all on table public.listing_observations from anon, authenticated;
revoke all on table public.price_observations from anon, authenticated;
revoke all on table public.ingestion_quarantine from anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.prevent_observation_mutation() from public, anon, authenticated;
revoke all on function public.increment_listing_observation_count()
    from public, anon, authenticated;
revoke all on function public.increment_price_observation_count()
    from public, anon, authenticated;

grant select on table public.property_sources to anon;
grant select on table public.neighbourhoods to anon;
grant select on table public.property_assets to anon;
grant select on table public.property_listings to anon;
grant select on table public.price_observations to anon;

create policy "Inspector can read property sources"
on public.property_sources for select to anon using (true);

create policy "Inspector can read neighbourhoods"
on public.neighbourhoods for select to anon using (true);

create policy "Inspector can read property assets"
on public.property_assets for select to anon using (true);

create policy "Inspector can read property listings"
on public.property_listings for select to anon using (true);

create policy "Inspector can read price observations"
on public.price_observations for select to anon using (true);

comment on table public.property_assets is
    'Possible canonical real-world properties; never created automatically during source import.';
comment on column public.property_listings.external_id is
    'Source-specific identifier. CHH urlid values are provisional, not proven stable.';
comment on table public.listing_observations is
    'Immutable source harvest evidence. Raw rows are not exposed to anonymous clients.';
comment on table public.ingestion_quarantine is
    'Malformed records and potential identifier collisions pending human review.';
