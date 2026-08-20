# 06 - Data Model

**Purpose:** Entities, money, and lifecycle for the Direct / Pay demo.
**Last updated:** August 19, 2026 (approved OP Sepolia Web3 MVP)

## 1. Money

- Store USD as integer cents. No floats in the pricing or payment path.
  Field names such as `amountXcgCents` are a leftover from the earlier
  XCG book; the values are USD cents.
- Store USDC as integer atomic units with six decimals.
  `usdcAtomic = usdCents * 10_000` (1:1 with USD).
- Direct operations screens show **USD / $**. Pay and My Payments show
  USDC as the primary value and the matching USD rent beside it.
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
related-party flag. Property Score is not an input.

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
`transactionId`, optional `txHash`, and `safeAccountId` (a legacy demo field
name for the receiving account; the receiving address is a **mock EOA**, not
a real Safe). Do not call any
field a token ID in the UI. `externalTokenId` may exist as null.

`property` series type exists on `ra_series` so the platform is not
hardcoded to receivables. It is not implemented.

## 5. Lifecycle

`draft → under_review → funding → live/collecting → closed`  
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

Payer serialisation may include rent, dates, USDC amount, and the mock
receiving address (the approved EOA `0x1726cf86…4f6`). It may not include
fee, purchase price, holders, or distribution economics.

## 7. Persistence

The walkthrough stores the entire `DemoBook` as JSON in `ra_demo_state`.
New fields must default via `normalizeBook()` so an older payload does not
crash. `cryptoConfig` is catalog-owned (network, chain ID, native USDC,
explorer, receiving address). Older `optimism` books rematch to the default
testnet. Live mode is **OP Sepolia only**; Base Sepolia is demo-selectable
and mainnet stays off. Reset
restores the complete current seed and keeps the selected payment
network. No new migration for this pivot.
