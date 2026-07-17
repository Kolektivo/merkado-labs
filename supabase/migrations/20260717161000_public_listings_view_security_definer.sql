-- Public view must run as owner so anon can SELECT the projection without
-- needing SELECT on underlying property_listings / property_sources.
-- Labs only. Forward-only.

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
    'Public-safe projection. security_invoker=false so anon can read the view without table grants on property_listings.';

revoke all on table public.public_property_listings from anon, authenticated;
grant select on table public.public_property_listings to anon, authenticated;
