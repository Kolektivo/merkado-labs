-- Merkado Labs NFT v1 chain store: on-chain offer/purchase/deposit/claim
-- facts for the Base Sepolia walkthrough. Labs project only.
-- Amounts are numeric(78,0) decimal strings; token ids are int8.
-- RLS on, no anon/authenticated access.

create table if not exists public.ra_chain_epochs (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ra_chain_offers (
  offer_key text not null,
  chain_id bigint not null,
  contract_address text not null,
  token_id bigint not null,
  payout_address text not null,
  purchase_price numeric(78,0) not null,
  rent_installment_amount numeric(78,0) not null,
  mint_tx_hash text,
  mint_block_number bigint,
  purchased boolean not null default false,
  purchase_tx_hash text,
  purchase_block_number bigint,
  purchaser_address text,
  purchased_at timestamptz,
  epoch_id uuid not null references public.ra_chain_epochs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (chain_id, contract_address, token_id),
  unique (chain_id, offer_key)
);

create table if not exists public.ra_chain_events (
  id uuid primary key default gen_random_uuid(),
  epoch_id uuid not null references public.ra_chain_epochs(id) on delete cascade,
  chain_id bigint not null,
  contract_address text not null,
  tx_hash text not null,
  log_index bigint not null,
  block_number bigint not null,
  block_hash text not null,
  event_name text not null,
  event_args jsonb not null,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);

create table if not exists public.ra_rent_payment_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  epoch_id uuid not null references public.ra_chain_epochs(id) on delete cascade,
  chain_id bigint not null,
  contract_address text not null,
  token_id bigint not null,
  payment_request_id text not null,
  opaque_payment_id text not null,
  expected_amount numeric(78,0) not null,
  status text not null check (status in ('pending', 'confirmed', 'failed', 'replaced')),
  created_at timestamptz not null default now(),
  unique (opaque_payment_id)
);

create index if not exists ra_rent_payment_attempts_offer_idx
  on public.ra_rent_payment_attempts (chain_id, contract_address, token_id);

create table if not exists public.ra_rent_deposit_verifications (
  id uuid primary key default gen_random_uuid(),
  chain_id bigint not null,
  tx_hash text not null,
  log_index bigint not null,
  block_number bigint not null,
  token_id bigint not null,
  opaque_payment_id text not null,
  amount numeric(78,0) not null,
  payer_address text not null,
  payment_request_id text not null,
  epoch_id uuid not null references public.ra_chain_epochs(id) on delete cascade,
  status text not null default 'confirmed',
  confirmed_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index),
  unique (opaque_payment_id)
);

-- At most one confirmed verification per payment request.
create unique index if not exists ra_rent_deposit_verifications_payment_request_idx
  on public.ra_rent_deposit_verifications (payment_request_id)
  where status = 'confirmed';

create table if not exists public.ra_rent_claim_verifications (
  id uuid primary key default gen_random_uuid(),
  chain_id bigint not null,
  tx_hash text not null,
  log_index bigint not null,
  block_number bigint not null,
  contract_address text not null,
  token_id bigint not null,
  owner_address text not null,
  amount numeric(78,0) not null,
  epoch_id uuid not null references public.ra_chain_epochs(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index),
  unique (chain_id, contract_address, token_id, tx_hash)
);

alter table public.ra_chain_epochs enable row level security;
alter table public.ra_chain_offers enable row level security;
alter table public.ra_chain_events enable row level security;
alter table public.ra_rent_payment_attempts enable row level security;
alter table public.ra_rent_deposit_verifications enable row level security;
alter table public.ra_rent_claim_verifications enable row level security;

revoke all on public.ra_chain_epochs from public, anon, authenticated;
revoke all on public.ra_chain_offers from public, anon, authenticated;
revoke all on public.ra_chain_events from public, anon, authenticated;
revoke all on public.ra_rent_payment_attempts from public, anon, authenticated;
revoke all on public.ra_rent_deposit_verifications from public, anon, authenticated;
revoke all on public.ra_rent_claim_verifications from public, anon, authenticated;