# 06 - Data Model

**Purpose:** Entities, money, and lifecycle for the Direct / Pay demo.
**Last updated:** August 21, 2026 (automatic payout and listing expiry)

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
`transactionId`, optional `txHash`, and `safeAccountId`. Offers carry a
mocked per-listing `custody` object (listing offer id, offer address, owner,
sale-proceeds status, automatic landlord payout). `Offer.payout` stores the
selected method and fictional crypto destination; `publishedAt` plus `expiresAt`
enforce the 60-day purchase window. That object tracks the listing
offer; it is not a custody-product ledger. `externalTokenId` is set after
Merkado creates the offer. After sale, rent lands on that listing until
the holder claims it. Do not present this as a public token market.

Product rules for landlord sale proceeds, whichever book shape is live:

- One automatic payout per sold offer. `normalizeBook()` removes legacy
  `advance_settlement` rows and clears their offer / position references;
  migrates legacy claimable proceeds to Paid when a valid fictional destination
  exists; the mock does not merely hide them.
- Payout amount equals the purchase price. The fee is informational and
  is never deducted twice.
- The destination is chosen before submission. Demo submission requires
  `method = crypto` and an obviously fictional `0xDEMO…` address. Girasol bank
  payout remains `coming_soon`.
- Paid is terminal. There is no landlord claim action.
- `txHash` for this mock payout is `null`. Legacy demo hashes are discarded.
  No explorer link.
- The payout address is server-side and must not enter Marketplace,
  Pay, or Portfolio payloads.

Luis PR #22 (draft, not on `main`) still models a manual landlord claim and is
now superseded by this Product Lead decision. Reconcile or replace its
`OfferFundingRecord` / `LandlordProceedsClaim` flow with payout-first automatic
execution before review. Do not treat PR #22 as live.

`property` series type exists on `ra_series` so the platform is not
hardcoded to receivables. It is not implemented.

## 5. Lifecycle

`draft → under_review → funding (Listed) → live/collecting (Sold) → closed`  
`denied` is a review outcome. `expired` ends an unsold listing after 60 days.
`default` is an arrears outcome, not a shortcut.

Payment request: `due → initiated → pending → confirmed` (also failed,
overdue, expired, already paid). Confirmed is distinct from the first click.

Stage 0 is a hard gate. Dual-control release requires two different people.

Draft, under-review, and unfunded offers are not counted as money already
advanced or receivables already sold.

## 6. Anonymisation

Purchaser serialisation may include district, grades, Property Score, term.
It may not include tenant name, employer, address, contact, or exact income.
Marketplace and portfolio pages load that anonymised shape only.

Payer serialisation may include rent, dates, USDC amount, and a fictional
receiving address. It may not include fee, purchase price, holders, or
distribution economics.

## 7. Persistence

The walkthrough stores the entire `DemoBook` as JSON in `ra_demo_state`.
New fields must default via `normalizeBook()` so an older payload does not
crash. `cryptoConfig` is catalog-owned (network, chain ID, native USDC,
explorer, company Safe, sales proceeds Safe, offer factory). Older
`optimism` and OP Sepolia books rematch to **Base Sepolia**. Reset
restores the complete current seed and keeps the selected payment
network. Legacy `DemoAccount.payoutAddress` remains optional for compatibility;
new payout ownership is per offer. No new migration for this pivot.
