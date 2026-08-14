# 01 - Product Vision

**Purpose:** Why Merkado Labs exists now, who it is for, and what success looks like.
**Last updated:** August 14, 2026

## 1. One-sentence vision

Merkado Labs is the working demo of **Merkado Rent Advance** (landlord) and **Merkado Direct** (holder platform): a Curaçao landlord sells a short strip of future rent claims for cash now, without taking on a loan.

## 2. Problem

Private landlords on Curaçao often need a lump sum while a tenant is already in place. Conventional credit is slow, poorly matched to a performing lease, and easy to mis-label. The first live transaction, **MRA-001**, is a true sale of six months of rent receivables — not a mortgage, not a loan, and not a public investment product.

## 3. Who it is for

| Audience | Product name they see | What they need |
|---|---|---|
| Landlord / operations | Merkado Rent Advance | A clear quote, a Passport, and a single purchase price |
| Purchaser / holder | Merkado Direct | Anonymised offer facts and honest collection risk |
| Payer / tenant | Neither brand as a finance product | Reassurance that the tenancy does not change |
| Buildathon / partners | Labs demo | A working walkthrough without crypto theatre |

These names never appear on the same role screen. They carry different
disclosure duties. The Labs sidebar lists both only so a walkthrough can
switch roles.

**Passport** on this demo is the offer scorecard. It is not the merkado.cw
Property Passport (listing history on a real-estate page).

## 4. What this Labs repo is

This repository is **not** the live merkado.cw marketplace. Cars, listings, scrapers, and public browse now live in **merkado-cw**. Labs is the sandbox for the Rent Advance / Direct demo that may later sit at a surface such as `app.merkado.cw`.

The demo is off-chain on purpose: rent arrives in a Curaçao bank / foundation sub-ledger. A token would not make that receipt more true.

## 5. Success for this phase

- A visitor can walk MRA-001 from quote → Passport → tenant notice → funding → monthly collections.
- Pricing reproduces the locked pack (Cg 10,206 purchase price, 5.50% fee, ~21.6% effective annualised) and **blocks** anything over 24%.
- The payer app never shows economics. The purchaser app never shows tenant identity.
- Stage 0 legal questions stay visible and unresolved.
- The Future Caribbean application can point at a working Labs demo, not a slide.

## 6. What we refuse to claim

- That third-party holders may subscribe today
- That distributions are guaranteed
- That this is a loan, yield product, fund, or listed instrument
- That the demo is live on merkado.cw
