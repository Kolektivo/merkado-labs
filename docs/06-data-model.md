# 06 - Data Model

**Purpose:** Entities, money, and lifecycle for the Rent Advance demo.
**Last updated:** August 14, 2026

## 1. Money

- Store XCG as integer cents. No floats in the pricing path.
- Screens show **XCG / Cg only**. The 1.79 peg exists in code for later
  display; this demo does not show a USD equivalent (same as merkado.cw).
- Round fees half-up to the cent.

## 2. Pricing

```
gross_receivables = monthly_rent × months
fee               = round_half_up(gross × fee_rate)
purchase_price    = gross − fee
```

Effective annualised cost is the IRR of “cash in at t=0, rent forgone at t=1…N”, then `(1+i)^12 − 1`. If that value is above **0.24**, no offer is created.

MRA-001 locked result: rent 180000 cents, 6 months, 5.50% → fee 59400, purchase 1020600, effective ≈ 21.57%.

## 3. Entities

Series → Offer (transaction) → Receivables / Collections / Releases / Documents / Holders  
Offer also has Property, Lease, Payer file, Passport scores, Checklist.

`property` series type exists on `ra_series` so the platform is not hardcoded to receivables. It is not implemented.

## 4. Lifecycle

`draft → under_review → funding → live/collecting → closed`  
`default` is an arrears outcome, not a shortcut.

Stage 0 is a hard gate. Dual-control release requires two different people.

## 5. Anonymisation

Purchaser serialisation may include district, grades, rent-to-market, term. It may not include tenant name, employer, address, or exact income. Marketplace and portfolio pages load that anonymised shape only.
