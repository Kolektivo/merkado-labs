# ADR-0008 — Base Sepolia transferable NFT rent offer

**Status:** Accepted  
**Date:** 2026-08-21

## Context

The Labs demo needs one real on-chain flow on **Base Sepolia**. Earlier
decisions (ADR-0006, ADR-0007) kept payment and wallet behaviour mocked
behind a typed provider boundary, a sales-proceeds Safe automatic landlord
payout, a mocked **Connect wallet** button, and a 60-day listing window.

The Product Lead approved a real implementation: a single
non-upgradeable ERC-721 contract **`MerkadoRentOfferV1`** holds pooled
Circle native USDC rent, accounted per `tokenId`. One offer NFT is minted
per approved listing by the verified backend mint key. The NFT is
**transferable**, so the current token owner is the holder and can claim
that token's accrued rent. This removes the mock payment/wallet layer
entirely.

## Decision

- **Contract.** One non-upgradeable ERC-721, `MerkadoRentOfferV1`, on
  Base Sepolia. It holds pooled native USDC rent, accounted per `tokenId`.
  No listing expiry exists in the contract; offers do not auto-close.
- **Mint.** The verified backend mint key
  (`0xfC6ec9718d89d4935594E7DB78399913071FcDc4`, Base Sepolia, 2-of-3:
  Enrique, Luuk, Luis) mints one offer NFT per approved listing. Landlords
  never sign.
- **Transferable NFT = holder.** There is no transfer lock. The current
  NFT owner is the HOLDER. Only the current owner can claim that token's
  accrued rent.
- **Whole-offer purchase.** Anyone can buy a whole offer. The buyer pays
  the exact purchase price **directly to the locked landlord payout
  address**, and the NFT moves backend mint key → buyer atomically in the same
  transaction. No fractional purchase.
- **Renter deposit.** The renter (or any caller with the right data) calls
  `depositRent(tokenId, opaquePaymentId, amount)` with the exact monthly
  amount. The app schedules the six-month term; the contract imposes no
  deposit cap. Rent is stored in the pooled contract until the current owner
  claims it.
- **Owner claim.** The current NFT owner calls `claimRent(tokenId)` in
  Portfolio to withdraw the accrued USDC.
- **No mock layer.** `PAYMENT_RAIL_MODE`, the mock provider, the demo
  wallet, the demo outcome menu, and demo hashes are removed. The flow is
  the live flow on Base Sepolia, enabled by configuration.
- **Configuration.** `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` holds the
  deployed Base Sepolia address; it is **empty until deployment** and
  surfaces show a not-configured state. `NEXT_PUBLIC_MERKADO_COMPANY_SAFE`
  defaults to the verified backend mint key. Server-only `MERKADO_RPC_URL`
  defaults to `https://sepolia.base.org`. `NEXT_PUBLIC_PAY_NETWORK` stays
  `base-sepolia`.
- **Gates that stay closed.** Contract deployment, applying new
  migrations, sending test USDC, Safe transactions, hosted activation, and
  merging this PR remain separate approvals. Base Mainnet, real funds, and
  production stay blocked.

## Supersession

This ADR supersedes ADR-0006 and ADR-0007 **only where they conflict**:

- the typed mock provider boundary and `PAYMENT_RAIL_MODE` label flip;
- the sales-proceeds Safe automatic landlord payout;
- the mocked **Connect wallet** and demo outcome UI;
- the 60-day listing expiry;
- a landlord claim after sale;
- demo `0xDEMO…` payout addresses.

It retains their accepted facts: walletless landlord origination,
Merkado-created per-listing offers, renter rent paid to the offer, whole
offer purchase by one buyer, holder-initiated rent claim, the 24% cap, and
XCG / USDC 1:1 display.

## Consequences

- Positive: one real Base Sepolia demo path end to end; deterministic
  ownership via the transferable NFT; rent matching solved by
  `opaquePaymentId` instead of memo guessing.
- Positive: no code path can silently pretend a mocked payment is real.
- Negative: public on-chain wallet addresses and payout amounts become
  visible; tenant/property identity must stay off-chain.
- Negative: deployment, migrations, test USDC, and Safe operations require
  explicit approval before the surfaces activate.
- Follow-up: deployment must set `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS`;
  chain-store tables and verification are part of the same change.

## Approval

- Product Lead: approved the Base Sepolia transferable NFT rent offer
  flow, 2026-08-21.