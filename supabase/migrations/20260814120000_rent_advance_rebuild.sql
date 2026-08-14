-- Merkado Labs rebuild: retire the property-pipeline schema and install
-- Rent Advance / Merkado Direct demo tables. Labs project only.

drop view if exists public.public_property_listings cascade;

drop table if exists public.listing_images cascade;
drop table if exists public.listing_display_description_locales cascade;
drop table if exists public.property_pipeline_ai_spend cascade;
drop table if exists public.property_pipeline_source_locks cascade;
drop table if exists public.property_pipeline_events cascade;
drop table if exists public.property_pipeline_items cascade;
drop table if exists public.property_pipeline_source_stages cascade;
drop table if exists public.property_pipeline_runs cascade;
drop table if exists public.listing_match_reports cascade;
drop table if exists public.merkado_agent_entitlements cascade;
drop table if exists public.property_search_requests cascade;
drop table if exists public.ai_enrichment_proposals cascade;
drop table if exists public.ai_enrichment_jobs cascade;
drop table if exists public.listing_activity_events cascade;
drop table if exists public.property_source_runs cascade;
drop table if exists public.listing_enrichment_observations cascade;
drop table if exists public.listing_field_conflicts cascade;
drop table if exists public.contract_market_assessments cascade;
drop table if exists public.rental_contracts cascade;
drop table if exists public.neighbourhood_aliases cascade;
drop table if exists public.signal_evidence cascade;
drop table if exists public.market_signals cascade;
drop table if exists public.ingestion_quarantine cascade;
drop table if exists public.price_observations cascade;
drop table if exists public.listing_observations cascade;
drop table if exists public.property_listings cascade;
drop table if exists public.property_assets cascade;
drop table if exists public.neighbourhoods cascade;
drop table if exists public.property_sources cascade;

drop function if exists public._public_attribute_display_label cascade;
drop function if exists public._public_is_generic_neighbourhood cascade;
drop function if exists public.apply_listing_neighbourhood_assignments cascade;
drop function if exists public.apply_native_listing_lifecycle cascade;
drop function if exists public.delete_native_listing_image cascade;
drop function if exists public.increment_listing_observation_count cascade;
drop function if exists public.increment_price_observation_count cascade;
drop function if exists public.labs_delete_immutable_observation_rows cascade;
drop function if exists public.listing_coordinate_quality cascade;
drop function if exists public.prevent_listing_activity_core_mutation cascade;
drop function if exists public.prevent_neighbourhood_alias_cycle cascade;
drop function if exists public.prevent_observation_mutation cascade;
drop function if exists public.preview_listing_neighbourhood_assignments cascade;
drop function if exists public.reorder_native_listing_images cascade;
drop function if exists public.summarize_listing_neighbourhood_assignments cascade;

create table if not exists public.ra_series (
  id text primary key,
  platform text not null default 'merkado_direct',
  series_type text not null check (series_type in ('rent_advance', 'property')),
  display_name text not null,
  reference_prefix text not null default 'MRA',
  underlying_type text not null check (underlying_type in ('receivable', 'asset_interest')),
  instrument text not null default 'Digital Participation Right',
  created_at timestamptz not null default now()
);

create table if not exists public.ra_demo_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ra_offers (
  reference text primary key,
  status text not null,
  series_id text not null references public.ra_series(id),
  district text not null,
  property_summary text not null,
  payer_initials text not null,
  months integer not null check (months = 6),
  monthly_rent_cents integer not null check (monthly_rent_cents > 0),
  fee_rate numeric not null,
  fee_cents integer not null,
  purchase_price_cents integer not null,
  offering_cents integer not null,
  funded_cents integer not null default 0,
  related_party boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ra_receivables (
  id uuid primary key default gen_random_uuid(),
  offer_reference text not null references public.ra_offers(reference) on delete cascade,
  n integer not null,
  due_date date not null,
  amount_cents integer not null,
  status text not null,
  unique (offer_reference, n)
);

create table if not exists public.ra_collections (
  id uuid primary key default gen_random_uuid(),
  offer_reference text not null references public.ra_offers(reference) on delete cascade,
  receivable_n integer not null,
  received_on date not null,
  amount_cents integer not null,
  days_variance integer not null default 0,
  status text not null
);

create table if not exists public.ra_releases (
  id uuid primary key default gen_random_uuid(),
  offer_reference text not null references public.ra_offers(reference) on delete cascade,
  collection_id uuid not null references public.ra_collections(id) on delete cascade,
  instructor_id text not null,
  signatory_id text not null,
  status text not null,
  created_at timestamptz not null default now(),
  constraint ra_releases_distinct_people check (instructor_id <> signatory_id)
);

create table if not exists public.ra_checklist_items (
  id text primary key,
  stage integer not null check (stage in (0, 1)),
  title text not null,
  evidence text not null,
  owner text not null,
  state text not null check (state in ('open', 'closed')),
  hard_stop boolean not null default false,
  blocks text
);

create table if not exists public.ra_open_questions (
  id text primary key,
  title text not null,
  owner text not null,
  blocks text not null
);

create table if not exists public.ra_audit_events (
  id text primary key,
  offer_reference text references public.ra_offers(reference) on delete cascade,
  at timestamptz not null default now(),
  title text not null,
  detail text not null,
  actor text not null
);

alter table public.ra_series enable row level security;
alter table public.ra_demo_state enable row level security;
alter table public.ra_offers enable row level security;
alter table public.ra_receivables enable row level security;
alter table public.ra_collections enable row level security;
alter table public.ra_releases enable row level security;
alter table public.ra_checklist_items enable row level security;
alter table public.ra_open_questions enable row level security;
alter table public.ra_audit_events enable row level security;

revoke all on public.ra_series from anon, authenticated;
revoke all on public.ra_demo_state from anon, authenticated;
revoke all on public.ra_offers from anon, authenticated;
revoke all on public.ra_receivables from anon, authenticated;
revoke all on public.ra_collections from anon, authenticated;
revoke all on public.ra_releases from anon, authenticated;
revoke all on public.ra_checklist_items from anon, authenticated;
revoke all on public.ra_open_questions from anon, authenticated;
revoke all on public.ra_audit_events from anon, authenticated;

insert into public.ra_series (
  id, platform, series_type, display_name, reference_prefix, underlying_type, instrument
) values (
  'rent_advance',
  'merkado_direct',
  'rent_advance',
  'Merkado Direct · Rent Advance',
  'MRA',
  'receivable',
  'Digital Participation Right'
) on conflict (id) do nothing;

insert into public.ra_open_questions (id, title, owner, blocks) values
  ('M.1.2', 'Regulatory characterisation of the DPR', 'External counsel', 'All third-party investor activity'),
  ('M.1.3', 'Stichting Derdengelden object and board composition', 'Legal', 'All collection flow'),
  ('M.1.4', 'Whether holding investor funds requires licensing in its own right', 'External counsel', 'Merkado Direct as a public surface'),
  ('M.2.1', 'Assignment of future rent claims under Book 3', 'External counsel', 'Documentation template sign-off'),
  ('M.3.1', 'Arm’s-length substantiation of the related-party pilot', 'Tax', 'Nothing — priced 25bp above market')
on conflict (id) do nothing;
