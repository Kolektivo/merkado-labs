-- Evidence + AI enrichment foundation (Labs only).
-- Forward-only additive migration. Does not edit applied migrations.

-- ---------------------------------------------------------------------------
-- 1) Private raw evidence storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'listing-raw-evidence',
    'listing-raw-evidence',
    false,
    5242880,
    array['text/html', 'text/plain', 'application/json', 'application/octet-stream']
)
on conflict (id) do nothing;

-- No public/anon policies: service role only for raw HTML.

-- ---------------------------------------------------------------------------
-- 2) listing_observations: queryable evidence metadata (no full HTML)
-- ---------------------------------------------------------------------------
alter table public.listing_observations
    add column if not exists http_status integer,
    add column if not exists content_type text,
    add column if not exists adapter_version text,
    add column if not exists evidence_storage_bucket text,
    add column if not exists evidence_storage_path text,
    add column if not exists cleaned_listing_text text,
    add column if not exists source_description text,
    add column if not exists source_description_checksum text
        check (
            source_description_checksum is null
            or source_description_checksum ~ '^[0-9a-f]{64}$'
        ),
    add column if not exists structured_evidence jsonb not null default '{}'::jsonb,
    add column if not exists fetch_warnings jsonb not null default '[]'::jsonb;

comment on column public.listing_observations.evidence_storage_path is
    'Private Storage object path for full raw HTML/payload; never expose via anon.';
comment on column public.listing_observations.cleaned_listing_text is
    'Listing-specific cleaned text excluding page chrome.';
comment on column public.listing_observations.source_description is
    'Deterministic source description; never overwritten by AI.';

-- ---------------------------------------------------------------------------
-- 3) property_listings: source description checksum + first-observed status
-- ---------------------------------------------------------------------------
alter table public.property_listings
    add column if not exists source_description_checksum text
        check (
            source_description_checksum is null
            or source_description_checksum ~ '^[0-9a-f]{64}$'
        ),
    add column if not exists first_observed_sold_at timestamptz,
    add column if not exists first_observed_rented_at timestamptz,
    add column if not exists first_observed_under_contract_at timestamptz,
    add column if not exists source_status_date timestamptz,
    add column if not exists enrichment_status text
        check (
            enrichment_status is null
            or enrichment_status in (
                'not_run',
                'queued',
                'running',
                'succeeded',
                'skipped_unchanged',
                'failed',
                'needs_review'
            )
        )
        default 'not_run',
    add column if not exists enrichment_last_input_checksum text
        check (
            enrichment_last_input_checksum is null
            or enrichment_last_input_checksum ~ '^[0-9a-f]{64}$'
        ),
    add column if not exists enrichment_last_run_at timestamptz;

comment on column public.property_listings.first_observed_sold_at is
    'Earliest Merkado observation where source sold status was detected. Not a transaction/closing date.';
comment on column public.property_listings.first_observed_rented_at is
    'Earliest Merkado observation where source rented status was detected. Not a rental agreement date.';
comment on column public.property_listings.source_status_date is
    'Source-provided status date when explicitly stated; otherwise null.';

-- ---------------------------------------------------------------------------
-- 4) Extend listing_activity_events for rented / under-contract / return active
-- ---------------------------------------------------------------------------
alter table public.listing_activity_events
    drop constraint if exists listing_activity_events_event_type_check;

alter table public.listing_activity_events
    add constraint listing_activity_events_event_type_check
    check (
        event_type in (
            'first_seen',
            'source_listed',
            'price_changed',
            'currency_changed',
            'benchmark_recalculated',
            'source_marked_sold',
            'source_marked_rented',
            'source_marked_under_contract',
            'source_returned_active',
            'missing_from_source',
            'removed_from_source',
            'relisted',
            'source_attribution_changed',
            'material_field_changed',
            'source_description_changed'
        )
    );

-- ---------------------------------------------------------------------------
-- 5) AI enrichment jobs (admin/server write; dashboard may read via service)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_enrichment_jobs (
    id uuid primary key default gen_random_uuid(),
    scope_type text not null
        check (
            scope_type in (
                'listing',
                'listings',
                'source',
                'new_or_changed',
                'failed',
                'manual_selection'
            )
        ),
    scope_filter jsonb not null default '{}'::jsonb,
    property_source_id uuid references public.property_sources(id),
    requested_by text,
    status text not null
        check (
            status in (
                'queued',
                'running',
                'completed',
                'completed_with_errors',
                'failed',
                'cancelled'
            )
        )
        default 'queued',
    model text not null,
    prompt_version text not null,
    schema_version text not null,
    total_listings integer not null default 0 check (total_listings >= 0),
    processed_count integer not null default 0 check (processed_count >= 0),
    succeeded_count integer not null default 0 check (succeeded_count >= 0),
    skipped_unchanged_count integer not null default 0 check (skipped_unchanged_count >= 0),
    failed_count integer not null default 0 check (failed_count >= 0),
    current_batch integer,
    current_listing_id uuid references public.property_listings(id),
    token_usage jsonb not null default '{}'::jsonb,
    errors jsonb not null default '[]'::jsonb,
    summary jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    constraint ai_enrichment_jobs_time_order check (
        started_at is null or started_at >= created_at
    ),
    constraint ai_enrichment_jobs_completed_order check (
        completed_at is null
        or (started_at is not null and completed_at >= started_at)
    )
);

create index if not exists ai_enrichment_jobs_status_idx
    on public.ai_enrichment_jobs (status, created_at desc);

create index if not exists ai_enrichment_jobs_source_idx
    on public.ai_enrichment_jobs (property_source_id, created_at desc);

alter table public.ai_enrichment_jobs enable row level security;
revoke all on table public.ai_enrichment_jobs from anon, authenticated;
-- Dashboard uses publishable key for reads of job progress (no secrets in rows).
grant select on table public.ai_enrichment_jobs to anon, authenticated;
create policy ai_enrichment_jobs_anon_select
    on public.ai_enrichment_jobs
    for select
    to anon, authenticated
    using (true);

-- ---------------------------------------------------------------------------
-- 6) AI enrichment proposals (never overwrite source facts)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_enrichment_proposals (
    id uuid primary key default gen_random_uuid(),
    property_listing_id uuid not null references public.property_listings(id),
    enrichment_job_id uuid references public.ai_enrichment_jobs(id),
    model text not null,
    prompt_version text not null,
    schema_version text not null,
    input_checksum text not null check (input_checksum ~ '^[0-9a-f]{64}$'),
    status text not null
        check (
            status in (
                'succeeded',
                'failed',
                'skipped_unchanged',
                'invalid_output',
                'needs_review'
            )
        ),
    proposal jsonb not null default '{}'::jsonb,
    confidence numeric check (confidence is null or confidence between 0 and 1),
    supporting_evidence jsonb not null default '{}'::jsonb,
    warnings jsonb not null default '[]'::jsonb,
    token_usage jsonb not null default '{}'::jsonb,
    api_request_id text,
    error_message text,
    generated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint ai_enrichment_proposals_idempotent_key
        unique (
            property_listing_id,
            model,
            prompt_version,
            schema_version,
            input_checksum
        )
);

create index if not exists ai_enrichment_proposals_listing_idx
    on public.ai_enrichment_proposals (property_listing_id, generated_at desc);

create index if not exists ai_enrichment_proposals_job_idx
    on public.ai_enrichment_proposals (enrichment_job_id);

create index if not exists ai_enrichment_proposals_status_idx
    on public.ai_enrichment_proposals (status);

alter table public.ai_enrichment_proposals enable row level security;
revoke all on table public.ai_enrichment_proposals from anon, authenticated;
grant select on table public.ai_enrichment_proposals to anon, authenticated;
create policy ai_enrichment_proposals_anon_select
    on public.ai_enrichment_proposals
    for select
    to anon, authenticated
    using (true);

comment on table public.ai_enrichment_proposals is
    'AI-derived proposals only. Never overwrite raw evidence, source price, currency, status, dates, coords, address, neighbourhood, realtor, or source reference.';

-- ---------------------------------------------------------------------------
-- 7) Tighten CHH-era enrichment observations: keep readable but label as legacy
-- ---------------------------------------------------------------------------
comment on table public.listing_enrichment_observations is
    'Legacy CHH-era realtor field comparisons. New AI proposals use ai_enrichment_proposals.';
