-- Merkado Labs: make wallet challenge consumption and wallet replacement one
-- database transaction. Applied to the approved Labs branch.
-- Target: Labs project ewoxmzznkavapcxdporm. Production is forbidden.

alter table public.ra_link_challenges
  add constraint ra_link_challenges_account_id_fkey
  foreign key (account_id) references auth.users(id) on delete cascade;

create unique index ra_account_wallets_one_active_address
  on public.ra_account_wallets (lower(wallet_address))
  where replaced_at is null and revoked_at is null;

create or replace function public.link_account_wallet(
  p_account_id uuid,
  p_nonce text,
  p_wallet_address text,
  p_chain_id integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_id uuid;
begin
  if p_wallet_address !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'invalid wallet address';
  end if;

  update public.ra_link_challenges
  set consumed_at = now()
  where account_id = p_account_id
    and nonce = p_nonce
    and chain_id = p_chain_id
    and consumed_at is null
    and expires_at > now()
  returning id into challenge_id;

  if challenge_id is null then
    raise exception 'wallet link challenge already used or expired';
  end if;

  update public.ra_account_wallets
  set replaced_at = now()
  where account_id = p_account_id
    and replaced_at is null
    and revoked_at is null;

  insert into public.ra_account_wallets (
    account_id,
    wallet_address,
    chain_id
  ) values (
    p_account_id,
    lower(p_wallet_address),
    p_chain_id
  );
end;
$$;

revoke all on function public.link_account_wallet(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.link_account_wallet(uuid, text, text, integer)
  to service_role;
