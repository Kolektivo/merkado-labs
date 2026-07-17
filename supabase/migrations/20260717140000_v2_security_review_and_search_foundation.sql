-- V2 security hardening, AI review workflow, and Labs Search Request foundation.
-- Labs only (csaefdkpwukshtouyixg). Forward-only additive migration.

-- ---------------------------------------------------------------------------
-- 1) Lock AI enrichment tables: revoke public SELECT (proposals contain
--    model text, confidence, warnings, token usage — admin/service only).
-- ---------------------------------------------------------------------------
drop policy if exists ai_enrichment_proposals_anon_select
    on public.ai_enrichment_proposals;
drop policy if exists ai_enrichment_jobs_anon_select
    on public.ai_enrichment_jobs;

revoke all on table public.ai_enrichment_proposals from anon, authenticated;
revoke all on table public.ai_enrichment_jobs from anon, authenticated;

alter table public.ai_enrichment_proposals enable row level security;
alter table public.ai_enrichment_jobs enable row level security;

comment on table public.ai_enrichment_proposals is
    'AI-derived proposals only. Service-role / Labs admin reads. Never overwrite source facts. Not publicly accessible.';
comment on table public.ai_enrichment_jobs is
    'AI job progress and token usage. Service-role / Labs admin only. Not publicly accessible.';

-- ---------------------------------------------------------------------------
-- 2) Human review fields on AI proposals (approval never overwrites source)
-- ---------------------------------------------------------------------------
alter table public.ai_enrichment_proposals
    add column if not exists review_status text
        check (
            review_status is null
            or review_status in (
                'unreviewed',
                'approved_for_research',
                'rejected',
                'needs_changes'
            )
        )
        default 'unreviewed',
    add column if not exists review_notes text,
    add column if not exists reviewed_at timestamptz,
    add column if not exists reviewed_by text;

update public.ai_enrichment_proposals
set review_status = 'unreviewed'
where review_status is null;

alter table public.ai_enrichment_proposals
    alter column review_status set default 'unreviewed';

create index if not exists ai_enrichment_proposals_review_status_idx
    on public.ai_enrichment_proposals (review_status, generated_at desc);

comment on column public.ai_enrichment_proposals.review_status is
    'Labs human review of AI proposal. Approval does not overwrite source facts.';

-- ---------------------------------------------------------------------------
-- 3) Safe public listing view (eligible active priced listings only)
-- ---------------------------------------------------------------------------
create or replace view public.public_property_listings
with (security_invoker = true)
as
select
    pl.id,
    pl.external_id,
    pl.source_url,
    pl.original_realtor_url,
    pl.original_realtor_name,
    pl.original_realtor_domain,
    pl.listing_type,
    pl.source_listing_status,
    pl.property_type,
    pl.title,
    pl.original_price,
    pl.original_currency,
    pl.benchmark_price_xcg,
    pl.conversion_method,
    pl.conversion_provider,
    pl.conversion_rate,
    pl.conversion_rate_at,
    pl.currency_inferred,
    pl.bedrooms,
    pl.bathrooms,
    pl.floor_area_m2,
    pl.lot_area_value,
    pl.lot_area_unit,
    pl.latitude,
    pl.longitude,
    pl.primary_image_url,
    pl.description,
    pl.amenities,
    pl.status,
    pl.first_seen_at,
    pl.last_seen_at,
    pl.source_listed_at,
    pl.neighbourhood_id,
    pl.inferred_neighbourhood_id,
    pl.property_source_id,
    ps.source_key,
    ps.display_name as source_display_name
from public.property_listings pl
join public.property_sources ps on ps.id = pl.property_source_id
where pl.public_eligible = true
  and pl.status = 'active'
  and ps.enabled = true
  and coalesce(ps.adapter_status, 'active') <> 'retired';

comment on view public.public_property_listings is
    'Public-safe projection of eligible active listings. Excludes raw evidence, AI proposals, parser warnings, and internal confidence fields.';

grant select on public.public_property_listings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Property Search Request + Agent foundation (Labs preview; no billing)
-- ---------------------------------------------------------------------------
create table if not exists public.property_search_requests (
    id uuid primary key default gen_random_uuid(),
    title text,
    status text not null
        check (
            status in (
                'draft',
                'confirmed',
                'paused',
                'cancelled',
                'archived'
            )
        )
        default 'draft',
    transaction_type text
        check (
            transaction_type is null
            or transaction_type in ('sale', 'rent', 'either')
        ),
    min_price numeric,
    max_price numeric,
    price_currency text default 'XCG',
    min_bedrooms numeric,
    min_bathrooms numeric,
    min_floor_area_m2 numeric,
    property_types text[] not null default '{}',
    preferred_neighbourhoods text[] not null default '{}',
    excluded_neighbourhoods text[] not null default '{}',
    must_haves jsonb not null default '[]'::jsonb,
    preferences jsonb not null default '[]'::jsonb,
    dealbreakers jsonb not null default '[]'::jsonb,
    renovation_willingness text
        check (
            renovation_willingness is null
            or renovation_willingness in (
                'none',
                'light',
                'moderate',
                'major',
                'unknown'
            )
        ),
    timeline text,
    notes text,
    intake_source text
        check (
            intake_source is null
            or intake_source in (
                'direct',
                'what_fits_me',
                'labs_demo',
                'import'
            )
        )
        default 'labs_demo',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    confirmed_at timestamptz
);

create index if not exists property_search_requests_status_idx
    on public.property_search_requests (status, updated_at desc);

alter table public.property_search_requests enable row level security;
revoke all on table public.property_search_requests from anon, authenticated;

comment on table public.property_search_requests is
    'Labs/preview Property Search Requests. No production user accounts or billing.';

create table if not exists public.merkado_agent_entitlements (
    id uuid primary key default gen_random_uuid(),
    property_search_request_id uuid not null
        references public.property_search_requests(id) on delete cascade,
    status text not null
        check (
            status in ('test', 'active', 'paused', 'cancelled')
        )
        default 'test',
    delivery_channel text not null default 'labs_preview'
        check (delivery_channel in ('labs_preview', 'email_future')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint merkado_agent_entitlements_one_per_request
        unique (property_search_request_id)
);

alter table public.merkado_agent_entitlements enable row level security;
revoke all on table public.merkado_agent_entitlements from anon, authenticated;

comment on table public.merkado_agent_entitlements is
    'Test/preview Merkado Agent entitlements. No real billing or email delivery.';

create table if not exists public.listing_match_reports (
    id uuid primary key default gen_random_uuid(),
    property_search_request_id uuid not null
        references public.property_search_requests(id) on delete cascade,
    property_listing_id uuid not null
        references public.property_listings(id),
    match_score numeric check (match_score is null or match_score between 0 and 1),
    hard_pass boolean not null default false,
    match_reasons jsonb not null default '[]'::jsonb,
    trade_offs jsonb not null default '[]'::jsonb,
    evidence jsonb not null default '{}'::jsonb,
    scoring_version text not null default 'rules_v1',
    generated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint listing_match_reports_unique_pair
        unique (property_search_request_id, property_listing_id, scoring_version)
);

create index if not exists listing_match_reports_request_idx
    on public.listing_match_reports (property_search_request_id, match_score desc nulls last);

alter table public.listing_match_reports enable row level security;
revoke all on table public.listing_match_reports from anon, authenticated;

comment on table public.listing_match_reports is
    'Deterministic Labs Match Report previews. Explainable rules-based scoring only.';

-- ---------------------------------------------------------------------------
-- 5) Ensure listing_observations evidence remains non-public
-- ---------------------------------------------------------------------------
revoke all on table public.listing_observations from anon, authenticated;
alter table public.listing_observations enable row level security;
-- No anon/authenticated policies: service role only for raw evidence metadata.
