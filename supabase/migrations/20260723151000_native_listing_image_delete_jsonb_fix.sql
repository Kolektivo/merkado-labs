-- Forward fix for Labs, where property_listings.image_urls is jsonb.

create or replace function public.delete_native_listing_image(
  p_listing_id uuid,
  p_storage_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.property_listings%rowtype;
  v_image public.listing_images%rowtype;
  v_urls jsonb;
  v_primary_url text;
  v_eligible boolean;
  v_reason text;
begin
  if nullif(trim(coalesce(p_storage_path, '')), '') is null then
    raise exception 'Image path is required.';
  end if;

  select *
  into v_listing
  from public.property_listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'Native listing not found.';
  end if;
  if v_listing.listing_origin is distinct from 'manual' then
    raise exception 'Image removal is only for manual listings.';
  end if;

  select *
  into v_image
  from public.listing_images
  where property_listing_id = p_listing_id
    and storage_path = p_storage_path;

  if not found then
    raise exception 'Image does not belong to this listing.';
  end if;

  delete from public.listing_images
  where id = v_image.id
    and property_listing_id = p_listing_id;

  update public.listing_images
  set is_primary = false
  where property_listing_id = p_listing_id;

  with ranked as (
    select
      id,
      row_number() over (
        order by sort_order asc, created_at asc, id asc
      ) - 1 as next_sort_order
    from public.listing_images
    where property_listing_id = p_listing_id
  )
  update public.listing_images li
  set
    sort_order = ranked.next_sort_order,
    is_primary = ranked.next_sort_order = 0
  from ranked
  where li.id = ranked.id;

  select
    coalesce(
      jsonb_agg(public_url order by sort_order asc, created_at asc, id asc),
      '[]'::jsonb
    )
  into v_urls
  from public.listing_images
  where property_listing_id = p_listing_id;

  v_primary_url := v_urls->>0;

  update public.property_listings
  set
    image_urls = v_urls,
    primary_image_url = v_primary_url,
    last_seen_at = now()
  where id = p_listing_id
  returning * into v_listing;

  if v_listing.status is distinct from 'active' then
    v_eligible := false;
    v_reason := 'not_active';
  elsif v_listing.original_price is null then
    v_eligible := false;
    v_reason := 'missing_price';
  elsif v_listing.original_price <= 0 then
    v_eligible := false;
    v_reason := 'non_positive_price';
  elsif nullif(trim(coalesce(v_listing.title, '')), '') is null
     or nullif(trim(coalesce(v_listing.real_estate_type, '')), '') is null
     or v_listing.listing_type not in ('sale', 'rent') then
    v_eligible := false;
    v_reason := 'missing_required_fields';
  elsif nullif(trim(coalesce(v_listing.primary_image_url, '')), '') is null then
    v_eligible := false;
    v_reason := 'missing_image';
  elsif nullif(trim(coalesce(v_listing.contact_method, '')), '') is null
     or nullif(trim(coalesce(v_listing.contact_value, '')), '') is null then
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
    'material_field_changed',
    now(),
    jsonb_build_object('image_removed', v_image.storage_path),
    jsonb_build_object('images_remaining', jsonb_array_length(v_urls)),
    'user_provided',
    1,
    'Native listing image removed.'
  );

  return jsonb_build_object(
    'ok', true,
    'storage_path', v_image.storage_path,
    'images_remaining', jsonb_array_length(v_urls),
    'eligible', v_eligible,
    'reason', v_reason
  );
end;
$$;
