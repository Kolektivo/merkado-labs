-- Property V2 stabilization: lock down internal tables, tighten public view grants,
-- and backfill public_eligible deterministically.
-- Labs only (csaefdkpwukshtouyixg). Forward-only.

-- ---------------------------------------------------------------------------
-- 1) Snapshot note (before): anon SELECT on property_listings, price_observations,
--    listing_activity_events, property_source_runs, property_sources, plus
--    overly broad grants on public_property_listings view.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2) Revoke anon/authenticated access to internal property tables
-- ---------------------------------------------------------------------------
drop policy if exists "Inspector can read property listings"
    on public.property_listings;
drop policy if exists "Inspector can read property sources"
    on public.property_sources;
drop policy if exists "Inspector can read price observations"
    on public.price_observations;
drop policy if exists "Inspector can read property assets"
    on public.property_assets;
drop policy if exists property_source_runs_anon_select
    on public.property_source_runs;
drop policy if exists listing_activity_events_anon_select
    on public.listing_activity_events;
drop policy if exists listing_enrichment_observations_anon_select
    on public.listing_enrichment_observations;
drop policy if exists listing_field_conflicts_anon_select
    on public.listing_field_conflicts;

revoke all on table public.property_listings from anon, authenticated;
revoke all on table public.property_sources from anon, authenticated;
revoke all on table public.property_source_runs from anon, authenticated;
revoke all on table public.listing_observations from anon, authenticated;
revoke all on table public.price_observations from anon, authenticated;
revoke all on table public.listing_activity_events from anon, authenticated;
revoke all on table public.listing_enrichment_observations from anon, authenticated;
revoke all on table public.listing_field_conflicts from anon, authenticated;
revoke all on table public.property_assets from anon, authenticated;
revoke all on table public.ai_enrichment_jobs from anon, authenticated;
revoke all on table public.ai_enrichment_proposals from anon, authenticated;
revoke all on table public.property_search_requests from anon, authenticated;
revoke all on table public.merkado_agent_entitlements from anon, authenticated;
revoke all on table public.listing_match_reports from anon, authenticated;

alter table public.property_listings enable row level security;
alter table public.property_sources enable row level security;
alter table public.property_source_runs enable row level security;
alter table public.listing_observations enable row level security;
alter table public.price_observations enable row level security;
alter table public.listing_activity_events enable row level security;

-- Neighbourhoods remain readable for public map/browse context (no PII).
-- Keep existing neighbourhood SELECT policy.

-- ---------------------------------------------------------------------------
-- 3) Public-safe projection: SELECT only; reaffirm eligibility rules
-- ---------------------------------------------------------------------------
create or replace view public.public_property_listings
with (security_invoker = false)
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
  and coalesce(pl.original_price, pl.current_price, 0) > 0
  and pl.source_url is not null
  and length(trim(pl.source_url)) > 0
  and ps.enabled = true
  and coalesce(ps.adapter_status, 'manual') <> 'retired';

comment on view public.public_property_listings is
    'Public-safe projection of eligible active listings. Excludes raw evidence, AI proposals, activity events, and internal metadata.';

revoke all on table public.public_property_listings from anon, authenticated;
grant select on table public.public_property_listings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Deterministic eligibility backfill (matches Python evaluate_public_eligibility)
-- ---------------------------------------------------------------------------
update public.property_listings pl
set
    public_eligible = case
        when not ps.enabled or coalesce(ps.adapter_status, '') = 'retired' then false
        when pl.source_url is null or length(trim(pl.source_url)) = 0 then false
        when pl.status <> 'active' then false
        when coalesce(pl.original_price, pl.current_price) is null then false
        when coalesce(pl.original_price, pl.current_price) <= 0 then false
        else true
    end,
    public_exclusion_reason = case
        when not ps.enabled or coalesce(ps.adapter_status, '') = 'retired' then 'source_disabled'
        when pl.source_url is null or length(trim(pl.source_url)) = 0 then 'missing_attribution'
        when pl.status <> 'active' then 'not_active'
        when coalesce(pl.original_price, pl.current_price) is null then 'missing_price'
        when coalesce(pl.original_price, pl.current_price) <= 0 then 'non_positive_price'
        else null
    end,
    updated_at = now()
from public.property_sources ps
where ps.id = pl.property_source_id;

-- Correct remaining bounded KW run that imported with max_items but outcome=success
update public.property_source_runs
set
    outcome = 'partial',
    notes = coalesce(notes, '') || ' SYSTEM_REPAIR:kw_bounded_run_false_removal_v1 outcome success→partial (max_items cap).',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'bounded', true,
        'complete_catalog', false,
        'repair_code', 'kw_bounded_run_false_removal_v1',
        'outcome_corrected_from', 'success'
    )
where id = 'f3fd5f2e-cd53-4f12-aafd-3e3c1622887a'
  and outcome = 'success';
