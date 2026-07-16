-- Repair false price drops where CaribbeanHouseHunt wrote a USD display amount
-- into price_naf (exact ÷1.8 vs the prior XCG observation). Raw listing_observations
-- are preserved for audit; only price_observations + listing current_price are fixed.
-- Labs project only.

-- Observations are normally immutable; allow a one-time corrective delete.
alter table public.price_observations disable trigger price_observations_are_immutable;

with ordered as (
    select
        po.id,
        po.property_listing_id,
        po.price,
        po.currency,
        lag(po.price) over (
            partition by po.property_listing_id
            order by po.observed_at, po.created_at, po.id
        ) as prior_price,
        lag(po.currency) over (
            partition by po.property_listing_id
            order by po.observed_at, po.created_at, po.id
        ) as prior_currency
    from public.price_observations po
),
bad as (
    select id as bad_observation_id
    from ordered
    where prior_price is not null
      and prior_currency = 'XCG'
      and currency = 'XCG'
      and price > 0
      and prior_price > price
      and abs((prior_price / price) - 1.8) < 0.02
)
delete from public.price_observations po
using bad
where po.id = bad.bad_observation_id;

alter table public.price_observations enable trigger price_observations_are_immutable;

with ordered as (
    select
        po.property_listing_id,
        po.price,
        po.currency,
        lag(po.price) over (
            partition by po.property_listing_id
            order by po.observed_at, po.created_at, po.id
        ) as prior_price,
        lag(po.currency) over (
            partition by po.property_listing_id
            order by po.observed_at, po.created_at, po.id
        ) as prior_currency,
        row_number() over (
            partition by po.property_listing_id
            order by po.observed_at desc, po.created_at desc, po.id desc
        ) as rn
    from public.price_observations po
),
-- After deleting bad rows, restore listing current_price from the latest remaining
-- observation for listings that still need a currency-swap correction marker.
-- Identify affected listings by matching known ÷1.8 pairs from listing_observations.
affected as (
    select distinct lo.property_listing_id
    from public.listing_observations lo
    join public.listing_observations earlier
      on earlier.property_listing_id = lo.property_listing_id
     and earlier.observed_at < lo.observed_at
    where (lo.raw_payload->>'price_naf') ~ '^[0-9]+(\.[0-9]+)?$'
      and (earlier.raw_payload->>'price_naf') ~ '^[0-9]+(\.[0-9]+)?$'
      and (earlier.raw_payload->>'price_naf')::numeric
          > (lo.raw_payload->>'price_naf')::numeric
      and abs(
            ((earlier.raw_payload->>'price_naf')::numeric
              / nullif((lo.raw_payload->>'price_naf')::numeric, 0))
            - 1.8
          ) < 0.02
),
latest_price as (
    select property_listing_id, price, currency
    from ordered
    where rn = 1
)
update public.property_listings pl
set
    current_price = latest_price.price,
    currency = latest_price.currency,
    price_observation_count = (
        select count(*)::integer
        from public.price_observations po
        where po.property_listing_id = pl.id
    ),
    updated_at = now()
from affected
join latest_price on latest_price.property_listing_id = affected.property_listing_id
where pl.id = affected.property_listing_id;
