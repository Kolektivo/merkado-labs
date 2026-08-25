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
- **Mint.** The server-held EOA mint key (`MERKADO_MINTER_PRIVATE_KEY`) mints one offer NFT per approved listing. Landlords
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
  is a legacy display label. Server-only `MERKADO_RPC_URL`
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
- the 60-day listing expiry (on 2026-08-25 a **display-only** 60-day window
  returned as informational customer text — never enforced; see below);
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

## Product Lead decisions 2026-08-25

The Product Lead approved four refinements to the ADR-0008 flow. They do not
change the contract design; they change how the surfaces behave and what
customers read.

1. **Display-only 60-day window.** Customer Marketplace and My Offers show
   "Available until [date] · 60-day listing window" as informational text.
   It is **never enforced**: the offer stays purchasable after the date, no
   Expired status derives from it, and the contract has no expiry. The hard
   60-day expiry superseded by this ADR stays superseded.
2. **Reset = fresh book + new chain-store epoch.** Admin **Reset the book**
   seeds the canonical offers (**MRA-001** + **MRA-010**) as `funding`
   offers with **empty on-chain state** and starts a **new chain-store
   epoch** so old on-chain facts are never reused. Reset does **not** roll
   back the chain; old contract state is abandoned. Pairing Reset
   operationally with a fresh Base Sepolia contract redeploy + env address
   update is a separate approved gate. Admin derives mint state from
   verified facts only: a broadcast-but-unverified mint reads **Mint in
   progress**, never **Minted**, and after reset MRA-001 is a fresh `funding`
   offer with no on-chain facts.
3. **Pay QR and copy controls are informational.** The QR, **copy address**,
   and **copy amount** controls return in the expanded **Pay with
   stablecoin** panel and only display the receiving address, USDC amount,
   and payment reference. They never submit a payment. `depositRent(tokenId,
   opaquePaymentId, amount)` via the wallet **Pay rent** action is the only
   valid payment path; **Continue with Sentoo** is a collapsed **Coming
   soon** panel; the renter never sees NFT / mint / contract / token
   wording.
4. **Customer statuses and drafts.** Customer-facing statuses are limited to
   **Under review → Listed → Sold → Paid** plus **Denied / Expired /
   Closed**. **Paid** is the landlord proceeds card only; the offer itself
   stays **Sold**. Mint / NFT / contract / Safe mint / Funding wording lives
   in Admin only. Landlord proceeds moves **Waiting → Processing → Paid**
   automatically (Processing = purchase submitted but not yet verified).
   My Offers next steps are **Listed for 60 days** (listed) and **Sale
   amount paid automatically** (sold). An explicit **Save draft** button
   persists the wizard's in-progress offer into **My Offers → Draft**; a
   draft has no chain or payment state and never appears on customer
   surfaces.

## Approval

- Product Lead: approved the Base Sepolia transferable NFT rent offer
  flow, 2026-08-21.