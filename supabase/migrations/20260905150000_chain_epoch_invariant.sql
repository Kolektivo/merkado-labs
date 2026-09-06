-- Merkado Labs: preserve one active chain-store epoch at a time.
-- Reviewed forward migration only. Apply only after the NFT chain-store
-- migration, with Product Lead approval. Production is forbidden.

create unique index if not exists ra_chain_epochs_one_active
  on public.ra_chain_epochs (active)
  where active = true;
