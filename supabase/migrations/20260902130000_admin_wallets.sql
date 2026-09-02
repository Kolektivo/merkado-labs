create table if not exists public.ra_admin_wallets (
  wallet_address text primary key,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  constraint ra_admin_wallets_address_format
    check (wallet_address = lower(wallet_address)
      and wallet_address ~ '^0x[0-9a-f]{40}$')
);

alter table public.ra_admin_wallets enable row level security;

revoke all on table public.ra_admin_wallets from anon, authenticated;

comment on table public.ra_admin_wallets is
  'Server-only allowlist for Labs Admin access. Wallet addresses are stored lowercase.';
