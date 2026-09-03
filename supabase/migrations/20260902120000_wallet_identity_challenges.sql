-- Wallet-first identity challenges for the Labs demo. Server-role only.
create table if not exists public.wallet_identity_challenges (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  domain text not null,
  chain_id bigint not null check (chain_id = 84532),
  nonce text not null unique,
  message text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wallet_identity_challenges_expiry_idx
  on public.wallet_identity_challenges (expires_at);

alter table public.wallet_identity_challenges enable row level security;
revoke all on public.wallet_identity_challenges from public, anon, authenticated;
