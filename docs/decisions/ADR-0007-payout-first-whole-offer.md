# ADR-0007 — Payout-first landlord and whole-offer purchase

**Status:** Accepted  
**Date:** 2026-08-21

## Context

After reviewing the working demo with Luuk, the Product Lead approved a simpler
operating model. A landlord claim after sale is unnecessary if the payout
destination is known before listing. Fractional purchases also add complexity
that is not part of the intended pilot. Holder ownership remains on-chain in the
future design because rent is paid to each listing offer and claimed by its
current owner.

This decision supersedes ADR-0006 only where ADR-0006 chose a landlord claim and
fractional Marketplace purchase. ADR-0006 remains accepted for walletless
origination, Merkado-created per-listing offers, separate company/sales-proceeds
Safes, renter-to-offer rent, and holder-initiated rent claim.

## Decision

- The landlord selects payout before submitting an offer. The active Labs path
  requires a fictional `0xDEMO…` crypto destination. Girasol bank payout is a
  Coming soon preview with an illustrative fee; it cannot submit.
- Approval creates the per-listing offer and lists it for 60 days.
- One buyer purchases 100% of the offer. Fractional purchase is rejected.
- Marketplace purchase and Portfolio rent claim show a mocked **Connect wallet**
  button. WalletConnect versus Privy is a later Luis choice. No SDK or
  ownership verification is installed in Labs.
- A whole-offer purchase triggers automatic landlord payout to the saved
  destination. There is no landlord claim button.
- Merkado Pay sends rent to the per-offer address. Stablecoin payment includes a
  QR and **I’ve sent this payment**. There is no Connect wallet action on Pay.
  Sentoo is a collapsed disabled visual bank-payment preview.
- The current holder connects and claims rent from the offer in Portfolio.
- Real wallet, Safe, NFT, USDC, Girasol, and Sentoo behavior remains blocked
  behind the separately reviewed Luis integration and Product Lead approval.

## Consequences

- Positive: fewer landlord steps, a clearer demo story, deterministic ownership,
  and a payout destination available to backend automation before sale.
- Positive: the 60-day deadline creates an explicit unsold outcome.
- Negative: production payout must handle atomicity, retries, failures, and
  authorization without relying on a landlord confirmation click.
- Negative: WalletConnect versus Privy remains a production integration choice.
- Follow-up: Luis must rework PR #22's manual-claim flow before it can be
  considered for merge.

## Approval

- Product Lead: implement the Luuk meeting decisions and update the build/docs,
  2026-08-21.
