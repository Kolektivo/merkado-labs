-- Labs native listing hardening (forward-only).
-- 1) At most one primary image per listing.
-- 2) Atomic lifecycle status + Passport event (+ eligibility) for manuals.

-- ---------------------------------------------------------------------------
-- 1) Primary image uniqueness
-- ---------------------------------------------------------------------------
-- Normalize any accidental multi-primary rows before the unique index.
with ranked as (
  select
    id,
    row_number() over (
      partition by property_listing_id
      order by sort_order asc, created_at asc, id asc
    ) as rn
  from public.listing_images
  where is_primary = true
)
update public.listing_images li
set is_primary = false
from ranked r
where li.id = r.id
  and r.rn > 1;

-- Ensure the lowest sort_order image is primary when images exist.
update public.listing_images li
set is_primary = true
where li.id in (
  select distinct on (property_listing_id) id
  from public.listing_images
  order by property_listing_id, sort_order asc, created_at asc, id asc
)
and not exists (
  select 1
  from public.listing_images other
  where other.property_listing_id = li.property_listing_id
    and other.is_primary = true
);

create unique index if not exists listing_images_one_primary_per_listing_idx
  on public.listing_images (property_listing_id)
  where is_primary = true;

comment on index public.listing_images_one_primary_per_listing_idx is
  'At most one primary image per listing. Application keeps sort_order 0 as primary when images exist.';

-- ---------------------------------------------------------------------------
-- 2) Atomic manual lifecycle transition
-- ---------------------------------------------------------------------------
create or replace function public.apply_native_listing_lifecycle(
  p_listing_id uuid,
  p_expected_status text,
  p_listing_patch jsonb,
  p_event_type text,
  p_previous_value jsonb,
  p_new_value jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.property_listings%rowtype;
  v_eligible boolean;
  v_reason text;
begin
  if p_listing_patch is null or jsonb_typeof(p_listing_patch) <> 'object' then
    raise exception 'listing patch required';
  end if;
  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception 'event type required';
  end if;

  select *
  into v_row
  from public.property_listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'Native listing not found.';
  end if;
  if v_row.listing_origin is distinct from 'manual' then
    raise exception 'Lifecycle RPC is only for manual listings.';
  end if;
  if p_expected_status is not null
     and v_row.status is distinct from p_expected_status then
    raise exception 'Listing status changed concurrently.';
  end if;

  update public.property_listings pl
  set
    status = coalesce(p_listing_patch->>'status', pl.status),
    published_at = case
      when p_listing_patch ? 'published_at'
        then nullif(p_listing_patch->>'published_at', '')::timestamptz
      else pl.published_at
    end,
    unpublished_at = case
      when p_listing_patch ? 'unpublished_at'
        then nullif(p_listing_patch->>'unpublished_at', '')::timestamptz
      else pl.unpublished_at
    end,
    sold_at = case
      when p_listing_patch ? 'sold_at'
        then nullif(p_listing_patch->>'sold_at', '')::timestamptz
      else pl.sold_at
    end,
    first_observed_sold_at = case
      when p_listing_patch ? 'first_observed_sold_at'
        then nullif(p_listing_patch->>'first_observed_sold_at', '')::timestamptz
      else pl.first_observed_sold_at
    end,
    first_observed_rented_at = case
      when p_listing_patch ? 'first_observed_rented_at'
        then nullif(p_listing_patch->>'first_observed_rented_at', '')::timestamptz
      else pl.first_observed_rented_at
    end,
    source_listing_status = case
      when p_listing_patch ? 'source_listing_status'
        then p_listing_patch->>'source_listing_status'
      else pl.source_listing_status
    end,
    last_seen_at = coalesce(
      nullif(p_listing_patch->>'last_seen_at', '')::timestamptz,
      now()
    )
  where pl.id = p_listing_id;

  insert into public.listing_activity_events (
    property_listing_id,
    event_type,
    event_at,
    previous_value,
    new_value,
    derivation_type,
    confidence,
    notes
  ) values (
    p_listing_id,
    p_event_type,
    now(),
    p_previous_value,
    p_new_value,
    'user_provided',
    1,
    p_notes
  );

  select *
  into v_row
  from public.property_listings
  where id = p_listing_id;

  if v_row.status is distinct from 'active' then
    v_eligible := false;
    v_reason := 'not_active';
  elsif v_row.original_price is null then
    v_eligible := false;
    v_reason := 'missing_price';
  elsif v_row.original_price <= 0 then
    v_eligible := false;
    v_reason := 'non_positive_price';
  elsif nullif(trim(coalesce(v_row.title, '')), '') is null
     or nullif(trim(coalesce(v_row.real_estate_type, '')), '') is null
     or v_row.listing_type not in ('sale', 'rent') then
    v_eligible := false;
    v_reason := 'missing_required_fields';
  elsif nullif(trim(coalesce(v_row.primary_image_url, '')), '') is null then
    v_eligible := false;
    v_reason := 'missing_image';
  elsif nullif(trim(coalesce(v_row.contact_method, '')), '') is null
     or nullif(trim(coalesce(v_row.contact_value, '')), '') is null then
    v_eligible := false;
    v_reason := 'missing_contact';
  else
    v_eligible := true;
    v_reason := 'eligible';
  end if;

  update public.property_listings
  set
    public_eligible = v_eligible,
    public_exclusion_reason = v_reason
  where id = p_listing_id;

  return jsonb_build_object(
    'id', p_listing_id,
    'status', v_row.status,
    'eligible', v_eligible,
    'reason', v_reason,
    'event_type', p_event_type
  );
end;
$$;

revoke all on function public.apply_native_listing_lifecycle(
  uuid, text, jsonb, text, jsonb, jsonb, text
) from public, anon, authenticated;

grant execute on function public.apply_native_listing_lifecycle(
  uuid, text, jsonb, text, jsonb, jsonb, text
) to service_role;

comment on function public.apply_native_listing_lifecycle is
  'Atomic manual listing status change + immutable Passport event + eligibility recompute. Service-role only.';
