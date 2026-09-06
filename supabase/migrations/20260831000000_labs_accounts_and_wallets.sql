-- Merkado Labs Phase 2: account-owned demo state + wallet data boundary.
-- UNAPPLIED — requires explicit Product Lead approval before applying to the
-- Labs project (ewoxmzznkavapcxdporm). Production is forbidden.
--
-- Each authenticated account owns an isolated demo book keyed by
-- id='live' + account_id=<auth user id>. The legacy shared row
-- (id='live', account_id NULL) is left in place and ignored by the new
-- account-scoped code paths.
--
-- The existing single-column id primary key cannot hold more than one 'live'
-- row, so it is replaced by a composite unique key (id, account_id) plus the
-- approved partial unique index that enforces exactly one live row per
-- account. NULL account_id rows (the legacy shared book) remain allowed and
-- distinct in both unique indexes.

alter table public.ra_demo_state
  drop constraint if exists ra_demo_state_pkey;

alter table public.ra_demo_state
  add column account_id uuid references auth.users(id);

alter table public.ra_demo_state
  add constraint ra_demo_state_id_account_key unique (id, account_id);

-- Approved partial unique index: exactly one live row per authenticated
-- account.
create unique index ra_demo_state_one_live_per_account
  on public.ra_demo_state (account_id)
  where account_id is not null and id = 'live';

-- One active linked wallet per account. The linking service is a later
-- package; this table prepares the data boundary for it.
create table if not exists public.ra_account_wallets (
  account_id uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null,
  chain_id integer not null,
  linked_at timestamptz not null default now(),
  replaced_at timestamptz,
  revoked_at timestamptz
);

-- At most one active (non-replaced, non-revoked) wallet per account.
create unique index ra_account_wallets_one_active_per_account
  on public.ra_account_wallets (account_id)
  where replaced_at is null and revoked_at is null;

-- Signed wallet-linking challenges, issued and consumed server-side only.
create table if not exists public.ra_link_challenges (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  nonce text not null unique,
  domain text not null,
  chain_id integer not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  statement text not null
);

alter table public.ra_account_wallets enable row level security;
alter table public.ra_link_challenges enable row level security;

revoke all on public.ra_account_wallets from anon, authenticated;
revoke all on public.ra_link_challenges from anon, authenticated;
