-- Dual-control on the live JSON book. Structured ra_releases is unused;
-- the app stores releases inside ra_demo_state.payload.

create or replace function public.ra_reject_same_person_release()
returns trigger
language plpgsql
as $$
declare
  same_person boolean;
begin
  select exists (
    select 1
    from jsonb_array_elements(coalesce(new.payload->'offers', '[]'::jsonb)) as offer
    cross join lateral jsonb_array_elements(
      coalesce(offer->'releases', '[]'::jsonb)
    ) as rel
    where coalesce(rel->>'instructorId', '') <> ''
      and rel->>'instructorId' = rel->>'signatoryId'
  ) into same_person;

  if same_person then
    raise exception 'Dual-control release requires two different people'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists ra_demo_state_dual_control on public.ra_demo_state;

create trigger ra_demo_state_dual_control
before insert or update of payload on public.ra_demo_state
for each row
execute function public.ra_reject_same_person_release();

revoke all on function public.ra_reject_same_person_release() from public, anon, authenticated;
