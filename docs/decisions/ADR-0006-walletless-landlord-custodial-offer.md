# ADR-0006 — Walletless landlord and Merkado-created listing offer

**Status:** Accepted; landlord-claim and fractional-purchase decisions
superseded by ADR-0007  
**Date:** 2026-08-20

## Context

Luuk (CTO) and Jose Luis confirmed a new on-chain architecture: landlords
should not need a wallet or any on-chain signature. After Merkado reviews
an offer request, the system creates the offer from Merkado’s Safe.
Investors / holders stay on-chain because they already have a wallet to
buy. Sale proceeds are segregated. The landlord claims the full purchase
price
from their Merkado account. Monthly rent then goes to the sold listing,
and the holder claims it through Merkado.

This conflicts with ADR-0005’s “no token / NFT / Claim button /
automatic distribution” demo stance. The Product Lead asked to implement
the new flow in the Labs demo (still mocked) and update docs.

## Decision

- Landlord origination is a **Merkado account request**. No wallet
  connect and no landlord signature.
- After independent approval, **Merkado creates the offer** from the
  company Safe. Merkado is the owner until sale.
- Marketplace purchase can still take any remaining amount. When the
  offering is filled, the offer moves to the holder.
- Sale funds land in a **sales proceeds Safe**. The landlord claims the
  purchase price shown when the offer was created. The displayed fee was
  already used to calculate that purchase price and is not deducted again.
  Any later live company-fee sweep must preserve that invariant and still
  needs Luis / Finance confirmation.
- The landlord **claims** the displayed purchase price from My Offers / the
  offer page, to a typed payout address. In this demo
  only a fictional `0xDEMO…` address is accepted and no send occurs.
  A real reviewed address belongs to the later live Safe send. Bank
  payout via Girasol is later, not pilot.
- After sale, the renter’s Pay address is the **listing collection
  address**, not the company Safe.
- Holder distributions are no longer automatic. Rent sits on that
  listing until the holder **Claims** it in Portfolio.
- Customer copy still avoids loan / yield / investment language.
  Internal and ops docs may say offer NFT / Safe / claim.
- Wallet, Safe SDK, and live USDC stay mocked in this repository until a
  separately approved Luis integration task. Draft PRs 19, 20, and 22
  stay unmerged.

## Recommended production mechanic (for Luis)

Do **not** make the landlord the on-chain sender of the claim. Merkado
executes a USDC transfer from the sales proceeds Safe to the saved
address. The landlord never pays gas. ERC-4337 / Coinbase Paymaster
sponsorship is a fallback only if a later design requires the landlord
to pull.

## Options considered

### Option A: Custodial create + claim payout (chosen)

Matches Luuk’s architecture and keeps landlords on the existing Merkado
account.

### Option B: Keep automatic settlement and no Claim

Cheaper for the current walkthrough, but contradicts the approved
architecture.

### Option C: Require the landlord to connect a wallet to claim

Fails the walletless goal. Paymaster sponsorship of a plain EOA is not
reliable.

## Consequences

- Positive: Landlord walkthrough no longer implies a wallet. Sale, fee,
  claim, rent destination, and holder claim are visible as separate
  steps.
- Negative: The previous “Pay once, everything updates automatically
  including holder distribution” story now stops at “rent arrived.” The
  holder must collect.
- Follow-up: Luis needs two Safes plus an offer contract, not one
  deposit Safe. Girasol and live sponsorship remain open.

## Amendment — 2026-08-20 (Luuk / Luis iteration)

Luuk confirmed three product refinements after iterating with Luis:

1. **One NFT per listing.** Tracking, later resale, and so Merkado is
   **not a custody system**. Merkado still creates the listing offer so
   the landlord never signs. After sale, that listing holds and collects
   rent. Merkado does not hold monthly rent.
2. **Payout method.** The local mock accepts a fictional `0xDEMO…`
   address. The live design later accepts a real destination from the
   Merkado account. No blockchain connect. Bank / Girasol stays later.
3. **Holder claim.** Re-add the investor **Claim** action. The listing
   collects rent; the holder claims it in Portfolio. Luis will confirm
   whether that `claim()` can be sponsored. Holders already have a
   wallet, so sponsorship is optional for the pilot.

Sale proceeds still use the dedicated sales proceeds Safe for the fee
split and the landlord claim. That is a short operational hold, not a
custody product.

## Relationship to ADR-0005

ADR-0005 remains accepted for the Buildathon demo, mocked Pay, and typed
provider boundary. This ADR supersedes ADR-0005 only where they conflict:
no NFT, no Claim, and automatic holder distribution.

## Amendment — 2026-08-21 (Luis Wave 3)

Luis confirmed the landlord sale-proceeds implementation on draft PR #22:

- Every offer uses one landlord proceeds claim. Automatic landlord
  settlement is removed.
- Claim states on his stack: Waiting, Available, Processing, Failed, Paid.
- No fake transaction hash or explorer link. Paid is terminal.
- Claim amount equals the purchase price. The fee is informational.
- The payout address locks after Claim proceeds. Failed retries use the
  same address only.
- Holder rent distributions stay automatic **on PR #22 only**, until his
  NFT wave. That does not reverse the Product Lead holder-claim intent
  in this ADR.
- PRs 19, 20, and 22 stay draft. The NFT flow is still mocked.

## Approval

- Product Lead: implement Luuk’s walletless landlord flow, 2026-08-20
- Architecture source: Luuk / Jose Luis chat, 2026-08-20
- Engineering status: Jose Luis Wave 3 chat, 2026-08-21

## Supersession — 2026-08-21

ADR-0007 supersedes this ADR only where it chose a landlord claim after sale and
allowed purchases of any remaining amount. The approved flow now selects payout
before submission, sells 100% of the offer to one buyer, and executes landlord
payout automatically. Walletless origination, Merkado-created per-listing
offers, renter-to-offer rent, and holder-initiated rent claim remain accepted.
