-- Atomic native-listing image reorder.
-- Serializes with image deletion through the property row lock and validates
-- the exact stored-path permutation inside the same transaction.

create or replace function public.reorder_native_listing_images(
  p_listing_id uuid,
  p_ordered_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.property_listings%rowtype;
  v_urls jsonb;
  v_stored_count integer;
  v_requested_count integer;
begin
  v_requested_count := coalesce(cardinality(p_ordered_paths), 0);
  if v_requested_count = 0 then
    raise exception 'At least one ordered image path is required.';
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
    raise exception 'Image reorder is only for manual listings.';
  end if;

  select count(*)
  into v_stored_count
  from public.listing_images
  where property_listing_id = p_listing_id;

  if v_stored_count <> v_requested_count then
    raise exception 'Image order must include every stored image exactly once.';
  end if;

  if (
    select count(distinct path)
    from unnest(p_ordered_paths) as requested(path)
  ) <> v_requested_count then
    raise exception 'Image order contains duplicate paths.';
  end if;

  if exists (
    select 1
    from unnest(p_ordered_paths) as requested(path)
    left join public.listing_images li
      on li.property_listing_id = p_listing_id
     and li.storage_path = requested.path
    where li.id is null
  ) then
    raise exception 'Image order contains an unknown or foreign path.';
  end if;

  update public.listing_images
  set is_primary = false
  where property_listing_id = p_listing_id;

  update public.listing_images li
  set
    sort_order = (requested.ordinality - 1)::integer,
    is_primary = requested.ordinality = 1
  from unnest(p_ordered_paths) with ordinality
    as requested(path, ordinality)
  where li.property_listing_id = p_listing_id
    and li.storage_path = requested.path;

  select
    jsonb_agg(public_url order by sort_order asc, created_at asc, id asc)
  into v_urls
  from public.listing_images
  where property_listing_id = p_listing_id;

  update public.property_listings
  set
    image_urls = v_urls,
    primary_image_url = v_urls->>0,
    last_seen_at = now()
  where id = p_listing_id;

  return jsonb_build_object(
    'ok', true,
    'images', v_requested_count,
    'primary_storage_path', p_ordered_paths[1]
  );
end;
$$;

revoke all on function public.reorder_native_listing_images(uuid, text[])
  from public, anon, authenticated;

grant execute on function public.reorder_native_listing_images(uuid, text[])
  to service_role;

comment on function public.reorder_native_listing_images is
  'Atomic exact-permutation reorder for manual listing images. Service-role only.';
