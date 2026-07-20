-- Property Data Operations v1: manual pipeline orchestration (Labs only).
-- Additive, non-destructive. Links to existing source runs and AI jobs.
-- Internal/admin progress only; no raw HTML; RLS enabled; nothing public.

-- ---------------------------------------------------------------------------
-- property_pipeline_runs: one manual Refresh & enrich execution
-- ---------------------------------------------------------------------------
create table if not exists public.property_pipeline_runs (
    id uuid primary key default gen_random_uuid(),
    correlation_id uuid not null unique default gen_random_uuid(),
    trigger_mode text not null
        check (trigger_mode in ('single_source', 'run_all_ready', 'resume', 'retry_items')),
    status text not null
        check (
            status in (
                'queued',
                'running',
                'completed',
                'completed_with_errors',
                'failed',
                'cancelled',
                'stopping'
            )
        )
        default 'queued',
    requested_by text not null default 'labs_admin',
    source_keys text[] not null default '{}',
    current_source_key text,
    current_stage text
        check (
            current_stage is null
            or current_stage in (
                'preflight',
                'scraping',
                'validation',
                'import',
                'location',
                'ai_enrichment',
                'verification'
            )
        ),
    stop_after_current_item boolean not null default false,
    preflight jsonb not null default '{}'::jsonb,
    progress jsonb not null default '{}'::jsonb,
    cost_summary jsonb not null default '{}'::jsonb,
    error_summary jsonb not null default '[]'::jsonb,
    locked_by text,
    locked_at timestamptz,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    constraint property_pipeline_runs_time_order check (
        started_at is null or started_at >= created_at
    ),
    constraint property_pipeline_runs_completed_order check (
        completed_at is null
        or (started_at is not null and completed_at >= started_at)
    ),
    constraint property_pipeline_runs_preflight_object check (
        jsonb_typeof(preflight) = 'object'
    ),
    constraint property_pipeline_runs_progress_object check (
        jsonb_typeof(progress) = 'object'
    ),
    constraint property_pipeline_runs_cost_object check (
        jsonb_typeof(cost_summary) = 'object'
    ),
    constraint property_pipeline_runs_errors_array check (
        jsonb_typeof(error_summary) = 'array'
    )
);

create index if not exists property_pipeline_runs_status_created_idx
    on public.property_pipeline_runs (status, created_at desc);

create index if not exists property_pipeline_runs_correlation_idx
    on public.property_pipeline_runs (correlation_id);

comment on table public.property_pipeline_runs is
    'Manual Data refresh orchestration. Service-role worker + Labs admin reads. Not public.';

alter table public.property_pipeline_runs enable row level security;
revoke all on table public.property_pipeline_runs from anon, authenticated;
grant select on table public.property_pipeline_runs to anon, authenticated;

create policy property_pipeline_runs_anon_select
    on public.property_pipeline_runs
    for select
    to anon, authenticated
    using (true);

-- ---------------------------------------------------------------------------
-- property_pipeline_source_stages: per-source stage progress within a run
-- ---------------------------------------------------------------------------
create table if not exists public.property_pipeline_source_stages (
    id uuid primary key default gen_random_uuid(),
    pipeline_run_id uuid not null
        references public.property_pipeline_runs(id) on delete cascade,
    correlation_id uuid not null,
    source_key text not null,
    stage text not null
        check (
            stage in (
                'preflight',
                'scraping',
                'validation',
                'import',
                'location',
                'ai_enrichment',
                'verification'
            )
        ),
    status text not null
        check (
            status in (
                'waiting',
                'running',
                'completed',
                'completed_with_warnings',
                'failed',
                'skipped',
                'blocked'
            )
        )
        default 'waiting',
    processed_count integer not null default 0 check (processed_count >= 0),
    total_count integer not null default 0 check (total_count >= 0),
    succeeded_count integer not null default 0 check (succeeded_count >= 0),
    failed_count integer not null default 0 check (failed_count >= 0),
    skipped_unchanged_count integer not null default 0 check (skipped_unchanged_count >= 0),
    warning_count integer not null default 0 check (warning_count >= 0),
    http_request_count integer not null default 0 check (http_request_count >= 0),
    cache_hit_count integer not null default 0 check (cache_hit_count >= 0),
    token_usage jsonb not null default '{}'::jsonb,
    estimated_ai_cost_usd numeric(12, 4),
    source_run_id uuid references public.property_source_runs(id),
    enrichment_job_id uuid references public.ai_enrichment_jobs(id),
    metrics jsonb not null default '{}'::jsonb,
    error_message text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    unique (pipeline_run_id, source_key, stage),
    constraint property_pipeline_source_stages_metrics_object check (
        jsonb_typeof(metrics) = 'object'
    ),
    constraint property_pipeline_source_stages_token_object check (
        jsonb_typeof(token_usage) = 'object'
    )
);

create index if not exists property_pipeline_source_stages_run_idx
    on public.property_pipeline_source_stages (pipeline_run_id, source_key);

create index if not exists property_pipeline_source_stages_correlation_idx
    on public.property_pipeline_source_stages (correlation_id);

comment on table public.property_pipeline_source_stages is
    'Per-source stage counters for a manual pipeline run. Links source runs and AI jobs.';

alter table public.property_pipeline_source_stages enable row level security;
revoke all on table public.property_pipeline_source_stages from anon, authenticated;
grant select on table public.property_pipeline_source_stages to anon, authenticated;

create policy property_pipeline_source_stages_anon_select
    on public.property_pipeline_source_stages
    for select
    to anon, authenticated
    using (true);

-- ---------------------------------------------------------------------------
-- property_pipeline_items: per-listing progress (expandable UI; not 220 bars)
-- ---------------------------------------------------------------------------
create table if not exists public.property_pipeline_items (
    id uuid primary key default gen_random_uuid(),
    pipeline_run_id uuid not null
        references public.property_pipeline_runs(id) on delete cascade,
    correlation_id uuid not null,
    source_key text not null,
    property_listing_id uuid references public.property_listings(id),
    external_id text,
    title text,
    current_stage text
        check (
            current_stage is null
            or current_stage in (
                'preflight',
                'scraping',
                'validation',
                'import',
                'location',
                'ai_enrichment',
                'verification'
            )
        ),
    status text not null
        check (
            status in (
                'waiting',
                'fetching',
                'parsed',
                'imported',
                'enriching',
                'complete',
                'complete_with_warnings',
                'failed',
                'skipped_unchanged',
                'blocked'
            )
        )
        default 'waiting',
    parse_result text,
    import_result text,
    ai_result text,
    token_usage jsonb not null default '{}'::jsonb,
    estimated_ai_cost_usd numeric(12, 4),
    error_summary text,
    transport_retries integer not null default 0
        check (transport_retries >= 0 and transport_retries <= 1),
    metadata jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint property_pipeline_items_token_object check (
        jsonb_typeof(token_usage) = 'object'
    ),
    constraint property_pipeline_items_metadata_object check (
        jsonb_typeof(metadata) = 'object'
    )
);

create index if not exists property_pipeline_items_run_status_idx
    on public.property_pipeline_items (pipeline_run_id, status);

create index if not exists property_pipeline_items_run_source_idx
    on public.property_pipeline_items (pipeline_run_id, source_key);

create index if not exists property_pipeline_items_correlation_idx
    on public.property_pipeline_items (correlation_id);

create index if not exists property_pipeline_items_listing_idx
    on public.property_pipeline_items (property_listing_id)
    where property_listing_id is not null;

comment on table public.property_pipeline_items is
    'Per-listing pipeline progress. No raw HTML. Expandable detail for ops UI.';

alter table public.property_pipeline_items enable row level security;
revoke all on table public.property_pipeline_items from anon, authenticated;
grant select on table public.property_pipeline_items to anon, authenticated;

create policy property_pipeline_items_anon_select
    on public.property_pipeline_items
    for select
    to anon, authenticated
    using (true);

-- ---------------------------------------------------------------------------
-- property_pipeline_events: append-only progress log
-- ---------------------------------------------------------------------------
create table if not exists public.property_pipeline_events (
    id uuid primary key default gen_random_uuid(),
    pipeline_run_id uuid not null
        references public.property_pipeline_runs(id) on delete cascade,
    correlation_id uuid not null,
    source_key text,
    stage text,
    property_listing_id uuid references public.property_listings(id),
    event_type text not null,
    message text not null,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint property_pipeline_events_details_object check (
        jsonb_typeof(details) = 'object'
    )
);

create index if not exists property_pipeline_events_run_created_idx
    on public.property_pipeline_events (pipeline_run_id, created_at);

create index if not exists property_pipeline_events_correlation_idx
    on public.property_pipeline_events (correlation_id);

comment on table public.property_pipeline_events is
    'Append-only pipeline progress events for Data Operations UI.';

alter table public.property_pipeline_events enable row level security;
revoke all on table public.property_pipeline_events from anon, authenticated;
grant select on table public.property_pipeline_events to anon, authenticated;

create policy property_pipeline_events_anon_select
    on public.property_pipeline_events
    for select
    to anon, authenticated
    using (true);

-- ---------------------------------------------------------------------------
-- Optional correlation link on existing AI jobs (additive nullable)
-- ---------------------------------------------------------------------------
alter table public.ai_enrichment_jobs
    add column if not exists pipeline_correlation_id uuid;

create index if not exists ai_enrichment_jobs_pipeline_correlation_idx
    on public.ai_enrichment_jobs (pipeline_correlation_id)
    where pipeline_correlation_id is not null;

comment on column public.ai_enrichment_jobs.pipeline_correlation_id is
    'Optional link to property_pipeline_runs.correlation_id for Data refresh runs.';

alter table public.property_source_runs
    add column if not exists pipeline_correlation_id uuid;

create index if not exists property_source_runs_pipeline_correlation_idx
    on public.property_source_runs (pipeline_correlation_id)
    where pipeline_correlation_id is not null;

comment on column public.property_source_runs.pipeline_correlation_id is
    'Optional link to property_pipeline_runs.correlation_id for Data refresh runs.';
