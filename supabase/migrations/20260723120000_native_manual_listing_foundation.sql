-- Labs admin native/manual real-estate listing foundation (forward-only).
-- Labs project only: csaefdkpwukshtouyixg
--
-- Naming contract (explicit — do not silently reinterpret):
--   - Existing property_listings.property_type remains the Labs real-estate
--     subtype / source type label (house, apartment, villa, …).
--   - New real_estate_type is the explicit subtype for native/manual rows and
--     the documented production-boundary name. Scraped rows keep property_type
--     as today; real_estate_type stays null unless backfilled later.
--   - Top-level marketplace discriminator property_type in {car, real_estate}
--     is NOT introduced here (production unification later).

-- ---------------------------------------------------------------------------
-- 1) Origin + manual ownership / contact / publish fields
-- ---------------------------------------------------------------------------
alter table public.property_listings
  add column if not exists listing_origin text not null default 'scraped';

alter table public.property_listings
  add column if not exists real_estate_type text;

alter table public.property_listings
  add column if not exists contact_name text;

alter table public.property_listings
  add column if not exists contact_method text;

alter table public.property_listings
  add column if not exists contact_value text;

alter table public.property_listings
  add column if not exists published_at timestamptz;

alter table public.property_listings
  add column if not exists unpublished_at timestamptz;

alter table public.property_listings
  add column if not exists owner_attributes jsonb not null default '[]'::jsonb;

alter table public.property_listings
  add column if not exists created_by_actor text;

comment on column public.property_listings.listing_origin is
  'scraped = direct-source adapter inventory; manual = Labs admin native listing (prototype). Never treat Labs property_type as car|real_estate.';

comment on column public.property_listings.real_estate_type is
  'Explicit real-estate subtype for native/manual listings (house, apartment, land, commercial, …). Labs property_type remains the legacy/scraped subtype column and must not be silently remapped.';

comment on column public.property_listings.owner_attributes is
  'User-provided public feature attributes for manual listings (allowlisted keys). Separate from AI applied_attributes.';

comment on column public.property_listings.created_by_actor is
  'Labs admin prototype actor label (not production auth.uid()).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'property_listings_listing_origin_check'
  ) then
    alter table public.property_listings
      add constraint property_listings_listing_origin_check
      check (listing_origin in ('scraped', 'manual'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'property_listings_contact_method_check'
  ) then
    alter table public.property_listings
      add constraint property_listings_contact_method_check
      check (
        contact_method is null
        or contact_method in ('whatsapp', 'phone', 'email')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'property_listings_owner_attributes_is_array'
  ) then
    alter table public.property_listings
      add constraint property_listings_owner_attributes_is_array
      check (jsonb_typeof(owner_attributes) = 'array');
  end if;
end $$;

-- Extend lifecycle statuses for manual publish/unpublish (scraped unchanged).
alter table public.property_listings
  drop constraint if exists property_listings_status_check;

alter table public.property_listings
  add constraint property_listings_status_check
  check (
    status = any (
      array[
        'draft'::text,
        'active'::text,
        'sold'::text,
        'missing'::text,
        'removed'::text,
        'inactive'::text,
        'unpublished'::text,
        'unknown'::text
      ]
    )
  );

-- Allow null source identity for manual listings only.
alter table public.property_listings
  alter column property_source_id drop not null;

alter table public.property_listings
  alter column source_url drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'property_listings_origin_identity_check'
  ) then
    alter table public.property_listings
      add constraint property_listings_origin_identity_check
      check (
        (
          listing_origin = 'scraped'
          and property_source_id is not null
          and source_url is not null
          and length(trim(source_url)) > 0
        )
        or (
          listing_origin = 'manual'
          and property_source_id is null
          and (source_url is null or length(trim(source_url)) = 0)
        )
      );
  end if;
end $$;

create index if not exists property_listings_listing_origin_idx
  on public.property_listings (listing_origin, status);

create index if not exists property_listings_manual_published_idx
  on public.property_listings (published_at desc nulls last)
  where listing_origin = 'manual';

-- ---------------------------------------------------------------------------
-- 2) Immutable activity events for manual lifecycle
-- ---------------------------------------------------------------------------
alter table public.listing_activity_events
  drop constraint if exists listing_activity_events_event_type_check;

alter table public.listing_activity_events
  add constraint listing_activity_events_event_type_check
  check (
    event_type = any (
      array[
        'first_seen'::text,
        'source_listed'::text,
        'price_changed'::text,
        'currency_changed'::text,
        'benchmark_recalculated'::text,
        'source_marked_sold'::text,
        'source_marked_rented'::text,
        'source_marked_under_contract'::text,
        'source_returned_active'::text,
        'missing_from_source'::text,
        'removed_from_source'::text,
        'relisted'::text,
        'source_attribution_changed'::text,
        'material_field_changed'::text,
        'source_description_changed'::text,
        'ai_enrichment_started'::text,
        'ai_enrichment_completed'::text,
        'ai_enrichment_failed'::text,
        'ai_enrichment_skipped'::text,
        'ai_enrichment_auto_applied'::text,
        'ai_enrichment_needs_attention'::text,
        'manual_override'::text,
        -- Native/manual Passport events (Labs admin prototype)
        'submitted'::text,
        'published'::text,
        'unpublished'::text,
        'marked_sold'::text,
        'marked_rented'::text,
        'republished'::text
      ]
    )
  );

alter table public.listing_activity_events
  drop constraint if exists listing_activity_events_derivation_type_check;

alter table public.listing_activity_events
  add constraint listing_activity_events_derivation_type_check
  check (
    derivation_type = any (
      array[
        'source_fact'::text,
        'system_calculated'::text,
        'inferred'::text,
        'user_provided'::text
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Ordered listing images (Merkado Storage paths)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(),
  property_listing_id uuid not null
    references public.property_listings (id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  sort_order integer not null default 0
    check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint listing_images_listing_path_key unique (property_listing_id, storage_path)
);

create index if not exists listing_images_listing_sort_idx
  on public.listing_images (property_listing_id, sort_order);

comment on table public.listing_images is
  'Ordered Merkado-hosted images for manual/native listings. Scraped listings continue to use external image_urls.';

alter table public.listing_images enable row level security;
revoke all on table public.listing_images from anon, authenticated;

-- Public read of image metadata only for public-eligible active manuals
-- (gallery URLs themselves are served from the public storage bucket).
create policy listing_images_public_select
  on public.listing_images
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.property_listings pl
      where pl.id = listing_images.property_listing_id
        and pl.listing_origin = 'manual'
        and pl.public_eligible = true
        and pl.status = 'active'
    )
  );

grant select on table public.listing_images to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Storage bucket for listing photos (public-read objects)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read; writes only via service role (no anon/authenticated insert policies).
drop policy if exists listing_images_bucket_public_read on storage.objects;
create policy listing_images_bucket_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'listing-images');
