-- Merkado Labs: restore the single shared demo book.
-- Reviewed forward migration only. Do not apply without Product Lead approval.
-- Production is forbidden.
--
-- Supabase Auth and linked wallets remain account-specific. The demo product
-- state is shared by all authenticated users through the legacy NULL account
-- row. Existing account-owned rows are intentionally left dormant; this
-- migration does not merge or delete data.

create unique index if not exists ra_demo_state_one_shared_live
  on public.ra_demo_state ((id))
  where id = 'live' and account_id is null;
