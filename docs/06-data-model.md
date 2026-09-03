# 06 - Data Model

**Purpose:** Entities, money, and lifecycle for the Direct / Pay demo.
**Last updated:** August 25, 2026 (display-only 60-day window, reset/new epoch, QR informational, customer statuses)

## 1. Money

- Store USD as integer cents. No floats in the pricing or payment path.
  Field names such as `amountXcgCents` are a leftover from the earlier
  XCG book; the values are USD cents.
- Store USDC as integer atomic units with six decimals.
  `usdcAtomic = usdCents * 10_000` (1:1 with USD).
- Direct operations screens show **XCG** at **1 USD = 1.79 XCG**.
  Pay shows XCG as the primary value and USDC as the settlement amount.
- Round fees half-up to the cent.

MRA-001 Pay conversion: USD 1,800 → 1,800,000,000 atomic → **1,800.00 USDC**.

## 2. Pricing

```
gross_receivables = monthly_rent × months
fee               = round_half_up(gross × fee_rate)
purchase_price    = gross − fee
```

Effective annualised cost is the IRR of “cash in at t=0, rent forgone at
t=1…N”, then `(1+i)^12 − 1`. If that value is above **0.24**, no offer is
created. There is no override.

MRA-001 locked result: rent 180000 cents, 6 months, 5.50% → fee 59400,
purchase 1020600, effective ≈ 21.57%.

Pricing inputs: monthly rent, term, **Listing Score**, **Payer Score**,
related-party flag. Property Score is not an input. The related-party
flag and note stay internal and are removed from purchaser payloads.

## 3. Property Score

```
rentToMarketRatio = contractualMonthlyRent / estimatedMarketMonthlyRent
```

Lower is more favourable. Multipliers:

- ratio <= 0.70 → 1.10
- ratio > 0.70 and <= 0.85 → 1.05
- ratio > 0.85 and <= 1.00 → 1.00
- ratio > 1.00 and <= 1.15 → 0.95
- ratio > 1.15 → 0.90

```
propertyScore = clamp(round(clamp(listingScore, 0, 100) * multiplier), 0, 100)
```

Missing, zero, negative, or non-finite market rent uses multiplier 1.00 and
an explicit “market data unavailable” state.

Examples: Listing Score 80 and ratio 0.60 → Property Score 88. Listing
Score 95 and ratio 0.60 caps at 100.

## 4. Entities

Series → Offer (transaction) → Receivables / Collections / Releases /
Documents / Holders / Payment requests / Distributions / Ledger
transactions.

Offer also has Property, Lease, Payer file, Listing Score (`passport.total`),
and checklist.

Stable demo IDs include `accountId`, `offerId`, `propertyId`, `receivableId`,
`paymentRequestId`, `positionId`, `collectionId`, `distributionId`,
`transactionId`, optional `txHash`, and `safeAccountId`. On the Base Sepolia
flow, an offer has an **offer token id** and an **opaque payment id** per rent
deposit. `Offer.payout` stores the selected method and the locked landlord
  payout destination; the buyer pays that address directly. The offer also
  stores the designated rent payer wallet used by generated payment requests.
  `externalTokenId` is
set to the minted NFT token id. There is no listing expiry; the 60-day window
shown on Marketplace and My Offers is **display-only** and never enforced.

### Contract state machine (`MerkadoRentOfferV1`)

The ERC-721 token is the offer. Per `tokenId`:

- `Offered` — minted by the backend mint key after approval. Owner = backend mint key.
- `Sold` — a buyer paid the exact purchase price to the locked landlord payout
  address; the NFT moved backend mint key → buyer atomically. Owner = the holder.
- `Renting` — rent is being deposited (`depositRent`); accrued USDC grows.
- `Claimed` — the current owner called `claimRent`; the token's accrued USDC
  balance resets.

The NFT is transferable at any point; the current token owner is the holder
and the only claimant.

### Opaque payment ids and money invariants

- `depositRent(tokenId, opaquePaymentId, amount)` requires the **exact monthly
  amount**. The app schedules the six-month term; the contract imposes no
  deposit cap.
- The `opaquePaymentId` is unique per deposit and binds the on-chain deposit
  to a payment request. Matching uses the id plus verified events, never memo
  guessing.
- **Money invariant:** the pooled USDC balance in the contract is always
  **≥ totalRentLiability** (sum of all deposited-but-unclaimed rent).
- Claim moves accrued rent from the pool to the current owner's wallet and
  reduces `totalRentLiability` by the same amount.
- Contract store is **USD cents** in the book and **USDC atomic units** (6
  decimals) on chain, 1:1 with USD.

### Chain store tables (new migration, not yet applied)

| Table | Purpose |
|---|---|
| `ra_chain_epochs` | Bookkeeping epoch per chain; tracks which blocks the server has indexed |
| `ra_chain_offers` | On-chain offer facts per token id (offer reference, token id, contract, minter, current owner, purchase tx) |
| `ra_chain_events` | Immutable record of mint / purchase / transfer / deposit / claim events observed |
| `ra_rent_payment_attempts` | Renter deposit attempts, initiated → pending → confirmed/failed |
| `ra_rent_deposit_verifications` | Verified deposit rows (unique per payment request; at most one confirmed) |
| `ra_rent_claim_verifications` | Verified claim rows (unique per claim; owner bound to the current token owner) |

All tables have RLS on and no `anon` / `authenticated` grants. They are
written only by server-side verification, never by browser code.

Product rules for landlord sale proceeds:

- One sale per offer. The buyer pays the exact purchase price **directly to
  the locked landlord payout address**; the NFT moves backend mint key → buyer
  atomically. There is no funding record and no landlord claim.
- Payout amount equals the purchase price. The fee is informational and
  is never deducted twice.
- The destination is chosen before submission. Paid is terminal when the sale
  completes.
- `txHash` is set from the real purchase transaction once the contract is
  deployed; explorer links open only for a real 64-hex hash.
- The payout address is server-side and must not enter Marketplace,
  Pay, or Portfolio payloads. On-chain, the payout address and amounts are
  public once active.

`property` series type exists on `ra_series` so the platform is not
hardcoded to receivables. It is not implemented.

## 5. Lifecycle

`draft → under_review → funding (Listed) → live/collecting (Sold) → closed`  
`denied` is a review outcome. `expired` and `closed` are explicit lifecycle
outcomes; there is no expired-after-60-days state.
`default` is an arrears outcome, not a shortcut.

Customer-facing statuses are limited to **Under review → Listed → Sold →
Paid** plus **Denied / Expired / Closed**. **Paid** refers to the landlord
proceeds card only; the offer itself stays **Sold**. The 60-day listing
window is **display-only**: "Available until [date]" on Marketplace and My
Offers is informational text, never enforced, and the contract has no expiry.
Landlord proceeds moves **Waiting → Processing → Paid** automatically
(Processing = purchase submitted but not yet verified).

Payment request: `due → initiated → pending → confirmed` (also failed,
overdue, expired, already paid). Confirmed is distinct from the first click.

Stage 0 is a hard gate. Dual-control release requires two different people.

Draft, under-review, and unsold offers are not counted as money already
advanced or receivables already sold. A **draft** persisted via **Save
draft** in Create Offer stays in **My Offers → Draft**, has no chain or
payment state, and never appears on customer surfaces.

## 6. Anonymisation

Purchaser serialisation may include district, grades, Property Score, term,
and the public token id. It may not include tenant name, employer, address,
contact, or exact income. Marketplace and portfolio pages load that
anonymised shape only.

Payer serialisation may include rent, dates, USDC amount, opaque payment id,
and the contract address. It may not include fee, purchase price, holders, or
distribution economics.

## 7. Persistence

The walkthrough stores the entire `DemoBook` as JSON in `ra_demo_state`.
New fields must default via `normalizeBook()` so an older payload does not
crash. `cryptoConfig` is catalog-owned (network, chain ID, native USDC,
explorer, backend mint key, contract address). Older
`optimism` and OP Sepolia books rematch to **Base Sepolia**. **Reset**
seeds the fresh demo book (**MRA-001** + **MRA-010** as `funding` offers with
**empty on-chain state**) and starts a **new chain-store epoch** so old
on-chain facts are never reused. Reset does **NOT** roll back the chain; the
env contract address stays active so approved offers mint again on the same
deployment. `cryptoConfig.offerNftContract` always resolves
`NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS`, the single source of truth.
Reset keeps the selected payment network. The chain store tables
(`ra_chain_*`, `ra_rent_*`) are a separate
reviewed migration that is **not yet applied**; the JSON book remains the
product state until then.
