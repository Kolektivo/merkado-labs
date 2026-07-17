-- Additive columns for direct-source import health reporting.
alter table public.property_source_runs
  add column if not exists imported_count integer not null default 0
    check (imported_count >= 0),
  add column if not exists updated_count integer not null default 0
    check (updated_count >= 0);

alter table public.property_listings
  add column if not exists bathrooms numeric,
  add column if not exists source_neighbourhood_text text,
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

alter table public.property_listings
  drop constraint if exists property_listings_image_urls_is_array;
alter table public.property_listings
  add constraint property_listings_image_urls_is_array
  check (jsonb_typeof(image_urls) = 'array');

comment on column public.property_source_runs.imported_count is
  'New listings inserted during the run';
comment on column public.property_source_runs.updated_count is
  'Existing listings updated during the run';
comment on column public.property_listings.source_neighbourhood_text is
  'Neighbourhood/area text as published by the source; separate from inferred geography';
