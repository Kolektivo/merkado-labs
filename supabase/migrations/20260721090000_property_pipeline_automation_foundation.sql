-- Labs-only property pipeline automation foundation.
-- Scheduling remains disabled: this migration records automation metadata and
-- provides lock/spend primitives for workflow_dispatch and local execution.

alter table public.property_pipeline_runs
    add column if not exists trigger_type text,
    add column if not exists run_summary jsonb not null default '{}'::jsonb,
    add column if not exists github_run_id text,
    add column if not exists github_workflow_ref text,
    add column if not exists dispatch_status text,
    add column if not exists automatic_refresh_enabled boolean not null default false;

update public.property_pipeline_runs
set trigger_type = 'manual'
where trigger_type is null;

alter table public.property_pipeline_runs
    alter column trigger_type set default 'manual',
    alter column trigger_type set not null;

alter table public.property_pipeline_runs
    drop constraint if exists property_pipeline_runs_trigger_type_check;

alter table public.property_pipeline_runs
    add constraint property_pipeline_runs_trigger_type_check
    check (trigger_type in ('scheduled', 'manual', 'local', 'dry_run'));

alter table public.property_pipeline_runs
    drop constraint if exists property_pipeline_runs_run_summary_object;

alter table public.property_pipeline_runs
    add constraint property_pipeline_runs_run_summary_object
    check (jsonb_typeof(run_summary) = 'object');

comment on column public.property_pipeline_runs.trigger_type is
    'Labs automation trigger provenance. scheduled is reserved for a later cron-enabling PR.';
comment on column public.property_pipeline_runs.automatic_refresh_enabled is
    'Feature-state snapshot. Defaults false while workflow_dispatch is the only GitHub trigger.';
comment on column public.property_pipeline_runs.run_summary is
    'Per-source Labs pipeline outcome, anomaly, import, and AI-budget summary.';

create table if not exists public.property_pipeline_source_locks (
    source_key text primary key,
    pipeline_run_id uuid not null
        references public.property_pipeline_runs(id) on delete cascade,
    locked_by text not null,
    locked_at timestamptz not null default now(),
    expires_at timestamptz not null,
    constraint property_pipeline_source_locks_expiry_order
        check (expires_at > locked_at)
);

create index if not exists property_pipeline_source_locks_expiry_idx
    on public.property_pipeline_source_locks (expires_at);

comment on table public.property_pipeline_source_locks is
    'Labs-only per-source execution locks with TTL-based stale recovery.';

alter table public.property_pipeline_source_locks enable row level security;
revoke all on table public.property_pipeline_source_locks from anon, authenticated;

create table if not exists public.property_pipeline_ai_spend (
    id uuid primary key default gen_random_uuid(),
    pipeline_run_id uuid not null
        references public.property_pipeline_runs(id) on delete cascade,
    spent_on date not null default current_date,
    listings_count integer not null default 0 check (listings_count >= 0),
    cost_usd numeric(12, 4) not null default 0 check (cost_usd >= 0),
    created_at timestamptz not null default now()
);

create index if not exists property_pipeline_ai_spend_day_idx
    on public.property_pipeline_ai_spend (spent_on);
create index if not exists property_pipeline_ai_spend_run_idx
    on public.property_pipeline_ai_spend (pipeline_run_id);

comment on table public.property_pipeline_ai_spend is
    'Labs-only daily/monthly AI spend ledger for property pipeline budget enforcement.';

alter table public.property_pipeline_ai_spend enable row level security;
revoke all on table public.property_pipeline_ai_spend from anon, authenticated;

alter table public.property_listings
    add column if not exists enrichment_last_change_checksum text;

comment on column public.property_listings.enrichment_last_change_checksum is
    'Meaningful source-input checksum used for new/changed enrichment selection; excludes timestamps, run IDs, and image ordering.';
