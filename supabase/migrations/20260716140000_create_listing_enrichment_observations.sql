-- Controlled original-realtor enrichment observations (Labs only).
-- Stores field-level evidence separately from CHH aggregator data.
-- Never auto-updates property_listings values; conflicts use listing_field_conflicts.

create table if not exists public.listing_enrichment_observations (
    id uuid primary key default gen_random_uuid(),
    property_listing_id uuid not null references public.property_listings(id) on delete cascade,
    adapter_name text not null,
    adapter_version text not null,
    source_domain text not null,
    original_url text not null,
    field_name text not null,
    raw_value text,
    normalized_value jsonb,
    extraction_method text not null
        check (
            extraction_method in (
                'json_ld',
                'embedded_json',
                'metadata',
                'labelled_html',
                'microdata',
                'description_explicit',
                'url_path'
            )
        ),
    evidence_selector text,
    evidence_snippet text,
    comparison_status text not null
        check (
            comparison_status in (
                'match',
                'enrichment',
                'conflict',
                'realtor_only',
                'skipped'
            )
        ),
    chh_value jsonb,
    fetch_sha256 text not null check (fetch_sha256 ~ '^[0-9a-f]{64}$'),
    observed_at timestamptz not null,
    created_at timestamptz not null default now(),
    constraint listing_enrichment_observations_natural_key
        unique (
            property_listing_id,
            adapter_name,
            adapter_version,
            field_name,
            fetch_sha256
        )
);

create index if not exists listing_enrichment_observations_listing_idx
    on public.listing_enrichment_observations (property_listing_id, observed_at desc);

create index if not exists listing_enrichment_observations_adapter_idx
    on public.listing_enrichment_observations (adapter_name, observed_at desc);

create index if not exists listing_enrichment_observations_status_idx
    on public.listing_enrichment_observations (comparison_status);

create index if not exists listing_enrichment_observations_domain_idx
    on public.listing_enrichment_observations (source_domain);

alter table public.listing_enrichment_observations enable row level security;

revoke all on table public.listing_enrichment_observations from anon, authenticated;

-- Publishable dashboard may read enrichment comparison rows (no secrets).
grant select on table public.listing_enrichment_observations to anon, authenticated;

create policy listing_enrichment_observations_anon_select
    on public.listing_enrichment_observations
    for select
    to anon, authenticated
    using (true);
