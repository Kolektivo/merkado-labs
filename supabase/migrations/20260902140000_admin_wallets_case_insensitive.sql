alter table public.ra_admin_wallets
  drop constraint if exists ra_admin_wallets_address_format;

alter table public.ra_admin_wallets
  add constraint ra_admin_wallets_address_format
  check (wallet_address ~* '^0x[0-9a-f]{40}$');

create unique index if not exists ra_admin_wallets_wallet_address_lower_idx
  on public.ra_admin_wallets (lower(wallet_address));

comment on constraint ra_admin_wallets_address_format on public.ra_admin_wallets is
  'Accepts valid Ethereum addresses regardless of checksum capitalization.';
