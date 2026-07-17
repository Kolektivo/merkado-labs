-- Direct-source foundation: source-run health, currency provenance,
-- lifecycle fields, and immutable activity events.
-- Labs only (csaefdkpwukshtouyixg). Forward-only. No destructive CHH cleanup.

-- ---------------------------------------------------------------------------
-- property_sources: source-neutral registry metadata
-- ---------------------------------------------------------------------------
alter table public.property_sources
    add column if not exists source_key text,
    add column if not exists display_name text,
    add column if not exists enabled boolean not null default true,
    add column if not exists removal_threshold integer not null default 2
        check (removal_threshold >= 1),
    add column if not exists adapter_status text not null default 'planned'
        check (adapter_status in ('planned', 'recon', 'manual', 'scheduled', 'retired'));

update public.property_sources
set
    source_key = coalesce(source_key, lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))),
    display_name = coalesce(display_name, name)
where source_key is null or display_name is null;

alter table public.property_sources
    alter column source_key set not null,
    alter column display_name set not null;

create unique index if not exists property_sources_source_key_key
    on public.property_sources (source_key);

-- ---------------------------------------------------------------------------
-- property_listings: lifecycle + currency provenance
-- ---------------------------------------------------------------------------
alter table public.property_listings
    drop constraint if exists property_listings_status_check;

alter table public.property_listings
    add constraint property_listings_status_check
    check (status in ('active', 'sold', 'missing', 'removed', 'inactive', 'unknown'));

alter table public.property_listings
    add column if not exists source_listed_at timestamptz,
    add column if not exists last_successfully_seen_at timestamptz,
    add column if not exists missing_since timestamptz,
    add column if not exists sold_at timestamptz,
    add column if not exists removed_at timestamptz,
    add column if not exists consecutive_successful_absences integer not null default 0
        check (consecutive_successful_absences >= 0),
    add column if not exists original_price numeric
        check (original_price is null or original_price >= 0),
    add column if not exists original_currency text
        check (original_currency is null or original_currency ~ '^[A-Z]{3}$'),
    add column if not exists benchmark_price_xcg numeric
        check (benchmark_price_xcg is null or benchmark_price_xcg >= 0),
    add column if not exists conversion_method text
        check (
            conversion_method is null
            or conversion_method in (
                'identity',
                'legacy_1_to_1',
                'usd_fixed_peg',
                'eur_api'
            )
        ),
    add column if not exists conversion_rate numeric
        check (conversion_rate is null or conversion_rate > 0),
    add column if not exists conversion_provider text,
    add column if not exists conversion_rate_at timestamptz,
    add column if not exists currency_inferred boolean not null default false,
    add column if not exists currency_inference_reason text,
    add column if not exists public_eligible boolean not null default false,
    add column if not exists public_exclusion_reason text;

-- Backfill original_* from legacy current_price/currency where empty.
update public.property_listings
set
    original_price = coalesce(original_price, current_price),
    original_currency = coalesce(original_currency, currency)
where original_price is null or original_currency is null;

create index if not exists property_listings_lifecycle_status_idx
    on public.property_listings (status);

create index if not exists property_listings_public_eligible_idx
    on public.property_listings (public_eligible)
    where public_eligible = true;

create index if not exists property_listings_source_listed_at_idx
    on public.property_listings (source_listed_at);

-- ---------------------------------------------------------------------------
-- price_observations: conversion provenance (immutable append-only rows)
-- ---------------------------------------------------------------------------
alter table public.price_observations
    add column if not exists original_price numeric
        check (original_price is null or original_price >= 0),
    add column if not exists original_currency text
        check (original_currency is null or original_currency ~ '^[A-Z]{3}$'),
    add column if not exists benchmark_price_xcg numeric
        check (benchmark_price_xcg is null or benchmark_price_xcg >= 0),
    add column if not exists conversion_method text
        check (
            conversion_method is null
            or conversion_method in (
                'identity',
                'legacy_1_to_1',
                'usd_fixed_peg',
                'eur_api'
            )
        ),
    add column if not exists conversion_rate numeric
        check (conversion_rate is null or conversion_rate > 0),
    add column if not exists conversion_provider text,
    add column if not exists conversion_rate_at timestamptz,
    add column if not exists currency_inferred boolean not null default false,
    add column if not exists currency_inference_reason text,
    add column if not exists price_evidence text;

-- price_observations are immutable; do not backfill existing rows.
-- New append-only price observations must populate original_* + benchmark columns.

-- ---------------------------------------------------------------------------
-- property_source_runs: source-run health
-- ---------------------------------------------------------------------------
create table if not exists public.property_source_runs (
    id uuid primary key default gen_random_uuid(),
    property_source_id uuid not null references public.property_sources(id),
    source_key text not null,
    adapter_name text not null,
    adapter_version text not null,
    started_at timestamptz not null,
    completed_at timestamptz,
    outcome text not null
        check (outcome in ('success', 'partial', 'failure')),
    discovered_count integer not null default 0 check (discovered_count >= 0),
    parsed_count integer not null default 0 check (parsed_count >= 0),
    excluded_no_price_count integer not null default 0 check (excluded_no_price_count >= 0),
    warning_count integer not null default 0 check (warning_count >= 0),
    error_count integer not null default 0 check (error_count >= 0),
    snapshot_checksum text,
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint property_source_runs_completed_order_check
        check (completed_at is null or completed_at >= started_at),
    constraint property_source_runs_metadata_object_check
        check (jsonb_typeof(metadata) = 'object')
);

create index if not exists property_source_runs_source_started_idx
    on public.property_source_runs (property_source_id, started_at desc);

create index if not exists property_source_runs_outcome_idx
    on public.property_source_runs (outcome, started_at desc);

alter table public.property_source_runs enable row level security;
revoke all on table public.property_source_runs from anon, authenticated;
grant select on table public.property_source_runs to anon, authenticated;

create policy property_source_runs_anon_select
    on public.property_source_runs
    for select
    to anon, authenticated
    using (true);

-- ---------------------------------------------------------------------------
-- listing_activity_events: immutable Passport timeline
-- ---------------------------------------------------------------------------
create table if not exists public.listing_activity_events (
    id uuid primary key default gen_random_uuid(),
    property_listing_id uuid not null references public.property_listings(id),
    event_type text not null
        check (
            event_type in (
                'first_seen',
                'source_listed',
                'price_changed',
                'currency_changed',
                'benchmark_recalculated',
                'source_marked_sold',
                'missing_from_source',
                'removed_from_source',
                'relisted',
                'source_attribution_changed',
                'material_field_changed'
            )
        ),
    event_at timestamptz not null,
    previous_value jsonb,
    new_value jsonb,
    listing_observation_id uuid references public.listing_observations(id),
    source_run_id uuid references public.property_source_runs(id),
    derivation_type text not null
        check (derivation_type in ('source_fact', 'system_calculated', 'inferred')),
    confidence numeric check (confidence is null or confidence between 0 and 1),
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists listing_activity_events_listing_event_idx
    on public.listing_activity_events (property_listing_id, event_at desc);

create index if not exists listing_activity_events_type_idx
    on public.listing_activity_events (event_type, event_at desc);

create trigger listing_activity_events_are_immutable
before update or delete on public.listing_activity_events
for each row execute function public.prevent_observation_mutation();

alter table public.listing_activity_events enable row level security;
revoke all on table public.listing_activity_events from anon, authenticated;
grant select on table public.listing_activity_events to anon, authenticated;

create policy listing_activity_events_anon_select
    on public.listing_activity_events
    for select
    to anon, authenticated
    using (true);

-- ---------------------------------------------------------------------------
-- Enrichment observations: source-neutral prior value column
-- ---------------------------------------------------------------------------
alter table public.listing_enrichment_observations
    add column if not exists prior_source_value jsonb;

update public.listing_enrichment_observations
set prior_source_value = coalesce(prior_source_value, chh_value)
where prior_source_value is null and chh_value is not null;

comment on column public.listing_enrichment_observations.chh_value is
    'Legacy column from retired CHH enrichment comparisons. Prefer prior_source_value.';

comment on column public.listing_enrichment_observations.prior_source_value is
    'Prior observed value used for comparison; source-neutral replacement for chh_value.';

comment on table public.property_source_runs is
    'Health and completeness records for direct-source adapter runs. Only complete success may drive missing/removal.';

comment on table public.listing_activity_events is
    'Immutable off-chain Passport activity log for source listings.';
