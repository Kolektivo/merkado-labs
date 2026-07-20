-- Review automation v4.1 + public image galleries (Labs only).
-- Forward-only replacement of public_property_listings.
-- Adds image_urls gallery array and expanded public attribute allowlist.
-- Prefers retained v4 proposals; falls back to v3. Exposes display_description.
-- Never exposes evidence, confidence, tokens, costs, or raw proposal JSON.

create or replace function public._public_is_generic_neighbourhood(value text)
returns boolean
language sql
immutable
as $$
  select case
    when value is null or length(trim(value)) = 0 then true
    else lower(trim(value)) in (
      'curacao',
      'curaçao',
      'curaçao island',
      'island',
      'netherlands antilles',
      'dutch caribbean'
    )
  end;
$$;

revoke all on function public._public_is_generic_neighbourhood(text) from public;
grant execute on function public._public_is_generic_neighbourhood(text) to authenticated, anon;

create or replace function public._public_attribute_display_label(attr_key text)
returns text
language sql
immutable
as $$
  select case attr_key
    when 'pool' then 'Pool'
    when 'pool_subtype' then 'Pool type'
    when 'furnished' then 'Furnished'
    when 'parking' then 'Parking'
    when 'parking_spaces' then 'Parking spaces'
    when 'garage' then 'Garage'
    when 'gated_community' then 'Gated community'
    when 'air_conditioning' then 'Air conditioning'
    when 'garden' then 'Garden'
    when 'terrace' then 'Terrace'
    when 'balcony' then 'Balcony'
    when 'sea_view' then 'Sea view'
    when 'solar_panels' then 'Solar panels'
    when 'generator' then 'Generator'
    when 'water_heater' then 'Water heater'
    when 'security_features' then 'Security'
    when 'security' then 'Security'
    when 'appliance_inclusion' then 'Appliances'
    when 'appliances' then 'Appliances'
    when 'accessibility' then 'Accessibility'
    when 'pet_suitability' then 'Pet suitability'
    when 'living_room' then 'Living room'
    when 'kitchen' then 'Kitchen'
    when 'outdoor_kitchen' then 'Outdoor kitchen'
    when 'gas_included' then 'Gas included'
    when 'garden_maintenance_included' then 'Garden maintenance included'
    else initcap(replace(coalesce(attr_key, ''), '_', ' '))
  end;
$$;

revoke all on function public._public_attribute_display_label(text) from public;
grant execute on function public._public_attribute_display_label(text) to authenticated, anon;

-- DROP + CREATE required: CREATE OR REPLACE cannot insert source_property_type
-- before title or append effective columns when column order/names would shift.
drop view if exists public.public_property_listings;
drop view if exists public.public_property_listings_v3_projection;

create view public.public_property_listings
with (security_invoker = false)
as
with retained as (
  -- Prefer latest succeeded/needs_review v4 proposal; fall back to v3.
  select distinct on (pl.id)
    pl.id as listing_id,
    a.proposal,
    a.input_checksum,
    a.status as proposal_status,
    a.generated_at,
    a.prompt_version
  from public.property_listings pl
  join public.ai_enrichment_proposals a
    on a.property_listing_id = pl.id
   and (
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
    pl.id,
    case when a.prompt_version = 'listing_enrichment_v4' then 0 else 1 end,
    a.generated_at desc nulls last
),
projected as (
  select
    pl.id,
    pl.external_id,
    pl.source_url,
    pl.original_realtor_url,
    pl.original_realtor_name,
    pl.original_realtor_domain,
    pl.listing_type,
    pl.source_listing_status,
    pl.property_type as source_property_type,
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
    case
      when jsonb_typeof(pl.image_urls) = 'array' then pl.image_urls
      else '[]'::jsonb
    end as image_urls,
    pl.description,
    pl.amenities,
    pl.status,
    pl.first_seen_at,
    pl.last_seen_at,
    pl.source_listed_at,
    pl.neighbourhood_id,
    pl.inferred_neighbourhood_id,
    pl.property_source_id,
    pl.source_neighbourhood_text,
    ps.source_key,
    ps.display_name as source_display_name,
    nullif(trim(pl.source_neighbourhood_text), '') as source_neighbourhood_raw,
    nullif(trim(n_map.name), '') as map_neighbourhood_name,
    r.proposal as retained_proposal,
    (
      select d->>'proposed_value'
      from jsonb_array_elements(
        coalesce(r.proposal->'field_decisions', '[]'::jsonb)
      ) d
      where d->>'key' = 'neighbourhood_candidate'
        and d->>'proposed_value' is not null
        and length(trim(d->>'proposed_value')) > 0
        and not public._public_is_generic_neighbourhood(d->>'proposed_value')
        and (d->>'confidence') is not null
        and (d->>'confidence')::numeric >= 0.85
        and coalesce(d->>'evidence_snippet', '') <> ''
        and d->>'final_status' in ('auto_applied', 'needs_attention')
        and not coalesce(d->'reasons', '[]'::jsonb) ? 'source_conflict'
        and not coalesce(d->'reasons', '[]'::jsonb) ? 'title_description_conflict'
      order by (d->>'confidence')::numeric desc
      limit 1
    ) as ai_neighbourhood_candidate,
    (
      select d->>'resulting_effective'
      from jsonb_array_elements(
        coalesce(r.proposal->'field_decisions', '[]'::jsonb)
      ) d
      where d->>'key' = 'property_type'
        and d->>'final_status' = 'auto_applied'
        and d->>'resulting_effective' is not null
        and length(trim(d->>'resulting_effective')) > 0
      limit 1
    ) as ai_property_type,
    (
      select d->>'resulting_effective'
      from jsonb_array_elements(
        coalesce(r.proposal->'field_decisions', '[]'::jsonb)
      ) d
      where d->>'key' = 'concise_summary'
        and d->>'final_status' = 'auto_applied'
        and d->>'resulting_effective' is not null
        and length(trim(d->>'resulting_effective')) > 0
      limit 1
    ) as effective_summary,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'key', canon_key,
            'display_label', public._public_attribute_display_label(canon_key),
            'value', public_value,
            'value_type', value_type,
            'subtype', subtype
          )
          order by canon_key
        ),
        '[]'::jsonb
      )
      from (
        -- Deduplicate aliases (gated/gated_community, solar/solar_panels, …)
        -- to one public attribute per canonical key.
        select distinct on (canon_key)
          canon_key,
          public_value,
          value_type,
          subtype
        from (
          select
            case
              when e->>'key' in ('gated', 'gated_community') then 'gated_community'
              when e->>'key' in ('solar', 'solar_panels') then 'solar_panels'
              when e->>'key' in ('security', 'security_features') then 'security_features'
              when e->>'key' in ('appliances', 'appliance_inclusion') then 'appliance_inclusion'
              else e->>'key'
            end as canon_key,
            case
              when jsonb_typeof(e->'effective_value') = 'boolean' then e->'effective_value'
              when e->>'effective_value' in ('true', 'present') then 'true'::jsonb
              when e->>'effective_value' in ('false', 'explicitly_absent') then 'false'::jsonb
              when e->>'effective_value' ~ '^-?[0-9]+(\\.[0-9]+)?$' then to_jsonb((e->>'effective_value')::numeric)
              else to_jsonb(e->>'effective_value')
            end as public_value,
            case
              when e->>'key' = 'parking_spaces' then 'number'
              when jsonb_typeof(e->'effective_value') = 'boolean'
                or e->>'effective_value' in ('true', 'false', 'present', 'explicitly_absent')
                then 'boolean'
              when e->>'effective_value' ~ '^-?[0-9]+(\\.[0-9]+)?$' then 'number'
              else 'text'
            end as value_type,
            case
              when e->'subtype' is not null and jsonb_typeof(e->'subtype') <> 'null'
                then e->>'subtype'
              when e->'pool_subtype' is not null and jsonb_typeof(e->'pool_subtype') <> 'null'
                then e->>'pool_subtype'
              else null
            end as subtype
          from jsonb_array_elements(
            coalesce(r.proposal->'applied_attributes', '[]'::jsonb)
          ) e
          where e->>'key' in (
            'pool',
            'pool_subtype',
            'furnished',
            'parking',
            'parking_spaces',
            'garage',
            'gated_community',
            'gated',
            'air_conditioning',
            'garden',
            'terrace',
            'balcony',
            'sea_view',
            'solar_panels',
            'solar',
            'generator',
            'water_heater',
            'security_features',
            'security',
            'appliance_inclusion',
            'appliances',
            'accessibility',
            'pet_suitability',
            'living_room',
            'kitchen',
            'outdoor_kitchen',
            'gas_included',
            'garden_maintenance_included'
          )
            and e->'effective_value' is not null
            and jsonb_typeof(e->'effective_value') <> 'null'
            and e->>'effective_value' not in ('', 'unknown')
            and exists (
              select 1
              from jsonb_array_elements(
                coalesce(r.proposal->'field_decisions', '[]'::jsonb)
              ) d
              where d->>'final_status' = 'auto_applied'
                and (
                  case
                    when d->>'key' in ('gated', 'gated_community') then 'gated_community'
                    when d->>'key' in ('solar', 'solar_panels') then 'solar_panels'
                    when d->>'key' in ('security', 'security_features') then 'security_features'
                    when d->>'key' in ('appliances', 'appliance_inclusion') then 'appliance_inclusion'
                    else d->>'key'
                  end
                ) = (
                  case
                    when e->>'key' in ('gated', 'gated_community') then 'gated_community'
                    when e->>'key' in ('solar', 'solar_panels') then 'solar_panels'
                    when e->>'key' in ('security', 'security_features') then 'security_features'
                    when e->>'key' in ('appliances', 'appliance_inclusion') then 'appliance_inclusion'
                    else e->>'key'
                  end
                )
            )
        ) raw_attrs
        where canon_key is not null
        order by canon_key
      ) attrs
    ) as public_attributes
  from public.property_listings pl
  join public.property_sources ps on ps.id = pl.property_source_id
  left join public.neighbourhoods n_map on n_map.id = pl.inferred_neighbourhood_id
  left join retained r on r.listing_id = pl.id
  where pl.public_eligible = true
    and pl.status = 'active'
    and coalesce(pl.original_price, pl.current_price, 0) > 0
    and pl.source_url is not null
    and length(trim(pl.source_url)) > 0
    and ps.enabled = true
    and coalesce(ps.adapter_status, 'manual') <> 'retired'
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
  case
    when lower(trim(coalesce(p.source_property_type, ''))) in (
      'residential', 'property', 'real_estate', 'other', 'unknown', 'n/a', 'na', ''
    )
      then coalesce(
        nullif(trim(p.ai_property_type), ''),
        nullif(trim(p.source_property_type), '')
      )
    else coalesce(
      nullif(trim(p.source_property_type), ''),
      nullif(trim(p.ai_property_type), '')
    )
  end as property_type,
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
  p.image_urls,
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
  case
    when not public._public_is_generic_neighbourhood(p.source_neighbourhood_raw)
      then trim(p.source_neighbourhood_raw)
    when not public._public_is_generic_neighbourhood(p.map_neighbourhood_name)
      then trim(p.map_neighbourhood_name)
    when not public._public_is_generic_neighbourhood(p.ai_neighbourhood_candidate)
      then trim(p.ai_neighbourhood_candidate)
    else null
  end as effective_neighbourhood,
  case
    when not public._public_is_generic_neighbourhood(p.source_neighbourhood_raw)
      then 'source'
    when not public._public_is_generic_neighbourhood(p.map_neighbourhood_name)
      then 'map'
    when not public._public_is_generic_neighbourhood(p.ai_neighbourhood_candidate)
      then 'ai_extracted'
    else 'unavailable'
  end as effective_neighbourhood_provenance,
  case
    when not public._public_is_generic_neighbourhood(p.source_neighbourhood_raw)
      then 'From source'
    when not public._public_is_generic_neighbourhood(p.map_neighbourhood_name)
      then 'Matched from map'
    when not public._public_is_generic_neighbourhood(p.ai_neighbourhood_candidate)
      then 'Extracted from listing text'
    else null
  end as effective_neighbourhood_provenance_label,
  case
    when lower(trim(coalesce(p.source_property_type, ''))) in (
      'residential', 'property', 'real_estate', 'other', 'unknown', 'n/a', 'na', ''
    )
      then coalesce(
        nullif(trim(p.ai_property_type), ''),
        nullif(trim(p.source_property_type), '')
      )
    else coalesce(
      nullif(trim(p.source_property_type), ''),
      nullif(trim(p.ai_property_type), '')
    )
  end as effective_property_type,
    coalesce(p.public_attributes, '[]'::jsonb) as public_attributes,
  p.effective_summary,
  nullif(
    jsonb_strip_nulls(
      jsonb_build_object(
        'language', nullif(trim(p.retained_proposal->>'source_language'), ''),
        'overview', (
          select nullif(trim(d->>'resulting_effective'), '')
          from jsonb_array_elements(
            coalesce(p.retained_proposal->'field_decisions', '[]'::jsonb)
          ) d
          where d->>'key' = 'display_overview'
            and d->>'final_status' = 'auto_applied'
          limit 1
        ),
        'layout', (
          select nullif(trim(d->>'resulting_effective'), '')
          from jsonb_array_elements(
            coalesce(p.retained_proposal->'field_decisions', '[]'::jsonb)
          ) d
          where d->>'key' = 'display_layout'
            and d->>'final_status' = 'auto_applied'
          limit 1
        ),
        'location', (
          select nullif(trim(d->>'resulting_effective'), '')
          from jsonb_array_elements(
            coalesce(p.retained_proposal->'field_decisions', '[]'::jsonb)
          ) d
          where d->>'key' = 'display_location'
            and d->>'final_status' = 'auto_applied'
          limit 1
        ),
        'highlights', (
          select case
            when jsonb_typeof(d->'resulting_effective') = 'array'
              then d->'resulting_effective'
            when nullif(trim(d->>'resulting_effective'), '') is null then null
            else jsonb_build_array(trim(d->>'resulting_effective'))
          end
          from jsonb_array_elements(
            coalesce(p.retained_proposal->'field_decisions', '[]'::jsonb)
          ) d
          where d->>'key' = 'display_highlights'
            and d->>'final_status' = 'auto_applied'
          limit 1
        ),
        'practical', (
          select nullif(trim(d->>'resulting_effective'), '')
          from jsonb_array_elements(
            coalesce(p.retained_proposal->'field_decisions', '[]'::jsonb)
          ) d
          where d->>'key' = 'display_practical'
            and d->>'final_status' = 'auto_applied'
          limit 1
        )
      )
    ),
    '{}'::jsonb
  ) as display_description
from projected p;

comment on view public.public_property_listings is
  'Public-safe effective listing projection. Prefers v4 proposals, falls back to v3. Exposes final effective values, display_description, and image_urls gallery — never raw proposals, evidence, confidence, tokens, or costs.';

revoke all on table public.public_property_listings from anon, authenticated;
grant select on table public.public_property_listings to anon, authenticated;
