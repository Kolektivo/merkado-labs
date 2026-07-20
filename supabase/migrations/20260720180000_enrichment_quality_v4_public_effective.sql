-- Enrichment quality v4 public-effective projection (Labs only).
-- Forward-only. Prefer retained v4 proposals; fall back to v3.
-- Exposes polished display_description JSONB; never evidence/tokens/cost.

-- Keep the prior v3 projection available as an internal fallback source.
alter view public.public_property_listings
  rename to public_property_listings_v3_projection;

revoke all on table public.public_property_listings_v3_projection from anon, authenticated;

create view public.public_property_listings
with (security_invoker = false)
as
with retained as (
  select distinct on (a.property_listing_id)
    a.property_listing_id,
    a.proposal,
    a.prompt_version
  from public.ai_enrichment_proposals a
  where (
      (
        a.prompt_version = 'listing_enrichment_v4'
        and a.schema_version = 'listing_enrichment_schema_v4'
      )
      or (
        a.prompt_version = 'listing_enrichment_v3'
        and a.schema_version = 'listing_enrichment_schema_v3'
      )
    )
    and a.status in ('succeeded', 'needs_review')
  order by
    a.property_listing_id,
    case when a.prompt_version = 'listing_enrichment_v4' then 0 else 1 end,
    a.generated_at desc nulls last
),
projected as (
  select
    v3.id,
    v3.external_id,
    v3.source_url,
    v3.original_realtor_url,
    v3.original_realtor_name,
    v3.original_realtor_domain,
    v3.listing_type,
    v3.source_listing_status,
    v3.property_type,
    v3.source_property_type,
    v3.title,
    v3.original_price,
    v3.original_currency,
    v3.benchmark_price_xcg,
    v3.conversion_method,
    v3.conversion_provider,
    v3.conversion_rate,
    v3.conversion_rate_at,
    v3.currency_inferred,
    v3.bedrooms,
    v3.bathrooms,
    v3.floor_area_m2,
    v3.lot_area_value,
    v3.lot_area_unit,
    v3.latitude,
    v3.longitude,
    v3.primary_image_url,
    v3.description,
    v3.amenities,
    v3.status,
    v3.first_seen_at,
    v3.last_seen_at,
    v3.source_listed_at,
    v3.neighbourhood_id,
    v3.inferred_neighbourhood_id,
    v3.property_source_id,
    v3.source_key,
    v3.source_display_name,
    v3.effective_neighbourhood,
    v3.effective_neighbourhood_provenance,
    v3.effective_neighbourhood_provenance_label,
    v3.effective_property_type,
    v3.public_attributes,
    v3.effective_summary as v3_effective_summary,
    (
      select d->>'resulting_effective'
      from jsonb_array_elements(coalesce(r.proposal->'field_decisions', '[]'::jsonb)) d
      where d->>'key' = 'concise_summary'
        and d->>'final_status' = 'auto_applied'
        and d->>'resulting_effective' is not null
        and length(trim(d->>'resulting_effective')) > 0
      limit 1
    ) as v4_effective_summary,
    nullif(
      jsonb_strip_nulls(
        jsonb_build_object(
          'language', nullif(trim(r.proposal->>'source_language'), ''),
          'overview', (
            select nullif(trim(d->>'resulting_effective'), '')
            from jsonb_array_elements(coalesce(r.proposal->'field_decisions', '[]'::jsonb)) d
            where d->>'key' = 'display_overview'
              and d->>'final_status' = 'auto_applied'
            limit 1
          ),
          'layout', (
            select nullif(trim(d->>'resulting_effective'), '')
            from jsonb_array_elements(coalesce(r.proposal->'field_decisions', '[]'::jsonb)) d
            where d->>'key' = 'display_layout'
              and d->>'final_status' = 'auto_applied'
            limit 1
          ),
          'location', (
            select nullif(trim(d->>'resulting_effective'), '')
            from jsonb_array_elements(coalesce(r.proposal->'field_decisions', '[]'::jsonb)) d
            where d->>'key' = 'display_location'
              and d->>'final_status' = 'auto_applied'
            limit 1
          ),
          'highlights', (
            select case
              when jsonb_typeof(d->'resulting_effective') = 'array' then d->'resulting_effective'
              when nullif(trim(d->>'resulting_effective'), '') is null then null
              else jsonb_build_array(trim(d->>'resulting_effective'))
            end
            from jsonb_array_elements(coalesce(r.proposal->'field_decisions', '[]'::jsonb)) d
            where d->>'key' = 'display_highlights'
              and d->>'final_status' = 'auto_applied'
            limit 1
          ),
          'practical', (
            select nullif(trim(d->>'resulting_effective'), '')
            from jsonb_array_elements(coalesce(r.proposal->'field_decisions', '[]'::jsonb)) d
            where d->>'key' = 'display_practical'
              and d->>'final_status' = 'auto_applied'
            limit 1
          )
        )
      ),
      '{}'::jsonb
    ) as display_description
  from public.public_property_listings_v3_projection v3
  left join retained r on r.property_listing_id = v3.id
)
select
  p.id,
  p.external_id,
  p.source_url,
  p.original_realtor_url,
  p.original_realtor_name,
  p.original_realtor_domain,
  p.listing_type,
  p.source_listing_status,
  p.property_type,
  p.source_property_type,
  p.title,
  p.original_price,
  p.original_currency,
  p.benchmark_price_xcg,
  p.conversion_method,
  p.conversion_provider,
  p.conversion_rate,
  p.conversion_rate_at,
  p.currency_inferred,
  p.bedrooms,
  p.bathrooms,
  p.floor_area_m2,
  p.lot_area_value,
  p.lot_area_unit,
  p.latitude,
  p.longitude,
  p.primary_image_url,
  p.description,
  p.amenities,
  p.status,
  p.first_seen_at,
  p.last_seen_at,
  p.source_listed_at,
  p.neighbourhood_id,
  p.inferred_neighbourhood_id,
  p.property_source_id,
  p.source_key,
  p.source_display_name,
  p.effective_neighbourhood,
  p.effective_neighbourhood_provenance,
  p.effective_neighbourhood_provenance_label,
  p.effective_property_type,
  p.public_attributes,
  coalesce(nullif(trim(p.v4_effective_summary), ''), p.v3_effective_summary) as effective_summary,
  p.display_description
from projected p;

comment on view public.public_property_listings is
  'Public-safe effective listing projection. Prefers v4 proposals, falls back to v3, and exposes only auto-applied display blocks.';

comment on view public.public_property_listings_v3_projection is
  'Internal v3 effective projection retained as fallback for v4 public view. Not for direct client use.';

revoke all on table public.public_property_listings from anon, authenticated;
grant select on table public.public_property_listings to anon, authenticated;
