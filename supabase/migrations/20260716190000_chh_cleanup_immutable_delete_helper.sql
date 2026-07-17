-- Service-role helper for deleting immutable observation rows during reviewed CHH cleanup.
-- Deletes only caller-supplied primary keys; re-enables triggers even on failure.

create or replace function public.labs_delete_immutable_observation_rows(
  p_listing_observation_ids uuid[],
  p_price_observation_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_deleted int := 0;
  price_deleted int := 0;
begin
  alter table public.listing_observations disable trigger listing_observations_are_immutable;
  alter table public.price_observations disable trigger price_observations_are_immutable;

  if p_price_observation_ids is not null then
    delete from public.price_observations
    where id = any (p_price_observation_ids);
    get diagnostics price_deleted = row_count;
  end if;

  if p_listing_observation_ids is not null then
    delete from public.listing_observations
    where id = any (p_listing_observation_ids);
    get diagnostics listing_deleted = row_count;
  end if;

  alter table public.listing_observations enable trigger listing_observations_are_immutable;
  alter table public.price_observations enable trigger price_observations_are_immutable;

  return jsonb_build_object(
    'listing_observations_deleted', listing_deleted,
    'price_observations_deleted', price_deleted
  );
exception
  when others then
    alter table public.listing_observations enable trigger listing_observations_are_immutable;
    alter table public.price_observations enable trigger price_observations_are_immutable;
    raise;
end;
$$;

revoke all on function public.labs_delete_immutable_observation_rows(uuid[], uuid[]) from public;
revoke all on function public.labs_delete_immutable_observation_rows(uuid[], uuid[]) from anon, authenticated;
grant execute on function public.labs_delete_immutable_observation_rows(uuid[], uuid[]) to service_role;

comment on function public.labs_delete_immutable_observation_rows(uuid[], uuid[]) is
  'Labs-only helper for reviewed CHH cleanup of immutable observation rows. Service role only.';
