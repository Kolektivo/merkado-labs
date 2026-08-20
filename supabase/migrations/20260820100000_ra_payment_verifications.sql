-- DB-backed idempotency for live USDC payment verification (Wave 2, PR #20).
-- Labs project only. Service-role access only; browser code never talks to it.
--
-- Guarantees:
--  1. One row per on-chain transfer log: unique (chain_id, tx_hash, log_index).
--  2. One confirmed verification per payment request: partial unique index on
--     (payment_request_id) where status = 'confirmed'.
--  3. RLS enabled with no anon / authenticated grants.

create table if not exists public.ra_payment_verifications (
  id uuid primary key default gen_random_uuid(),
  payment_request_id text not null,
  chain_id bigint not null,
  tx_hash text not null,
  log_index integer not null,
  sender_address text not null,
  recipient_address text not null,
  token_contract text not null,
  atomic_amount numeric not null,
  block_number bigint not null,
  confirmations integer not null,
  status text not null check (status in ('pending', 'confirmed', 'failed')),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (chain_id, tx_hash, log_index)
);

create unique index if not exists ra_payment_verifications_one_confirmed
  on public.ra_payment_verifications (payment_request_id)
  where status = 'confirmed';

alter table public.ra_payment_verifications enable row level security;

revoke all on public.ra_payment_verifications from anon, authenticated;