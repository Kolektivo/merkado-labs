# 09 - Current Product State

**Purpose:** Ground truth. Nothing may be described as live unless it is available on `merkado.cw`.
**Last updated:** August 14, 2026 (open demo at repository root; docs aligned with merkado-cw)

**Labs rebuild (2026-08-14 Product Lead):** Merkado Labs is no longer the
property-scraper kitchen. That work lives on **merkado-cw**. This repository is
the working **Merkado Rent Advance / Merkado Direct** demo. The Next.js app
lives at the repository root. There is no login.

This demo is **not** live on merkado.cw. It may later sit at a surface such as
`app.merkado.cw`. There is no public offering and no crypto in this build.

merkado-cw remains the live cars + real-estate marketplace. Its **Property
Passport** is listing history on a property page. This demo’s **Passport** is
the offer scorecard. They are different products.

## 1. Production today `[LIVE]`

Merkado on merkado.cw remains the Curaçao marketplace. Cars, listings, scrapers,
and public browse are owned by **merkado-cw**. This Labs repo does not operate
them.

Live production does **not** currently include Merkado Rent Advance or Merkado
Direct as a public product.

## 2. Labs demo today `[LABS]`

Verified from the repository root (lint, typecheck, unit tests, and a browser
walkthrough on 2026-08-14). The demo is open. No login, settings, or admin page.

| Surface | What a visitor sees |
|---|---|
| Overview `/` | Three role doors with labelled actions, MRA-001 locked figures, open gates, Reset demo |
| Offers `/originate` | Six-offer book first, status filters, XCG totals, collapsed Needs attention |
| Create offer `/originate/new` | Six-step wizard prefilled from the MRA-001 shape |
| Get Now `/originate/simulator` | 6-month pricing; 3/9/12 disabled; 24% cap blocks a quote |
| Offer detail `/originate/MRA-*` | Sale-not-loan, Passport, collections, dual control |
| Marketplace `/offers` | Anonymised cards; drafts and under-review hidden; Contribute closed |
| Portfolio `/portfolio` | Merkado Direct book-entry in XCG |
| Pay rent `/pay` | One page; “Your rent is unchanged.”; Cg 1,800.00 to the property manager; English / Nederlands / Papiamentu |

Old URLs (`/login`, `/settings`, `/originate/readiness`, `/pay/home`, and the
other retired payer subpages) redirect to Overview, Offers, or Pay rent.

### Locked MRA-001 figures (verified)

- Monthly rent **Cg 1,800.00** (180000 cents)
- Term **6 months**
- Gross receivables **Cg 10,800.00**
- Fee **5.50% = Cg 594.00**
- Purchase price **Cg 10,206.00**
- Effective annualised **≈ 21.6%** (under the 24% hard cap)
- Screens show **Cg / XCG only** (no USD equivalent)

A weak-score + related-party quote prices at **7.00%** and is blocked by the
24% cap.

### Privacy walls (verified in the browser)

- Purchaser marketplace shows district, band, rent-to-market, term. No tenant
  name, employer, street address, or income figure.
- Subscribe is closed and does not complete a purchase.
- Drafts are not shown as marketplace offers.
- Payer app shows rent to **Property Management B.V.** (Option A). No fee,
  holder, or return figures.
- Purchaser pages load an anonymised card only — not the full payer file.

### Working demo actions (verified)

- Record collection is offered only on live, collecting, or defaulted offers.
- Dual-control release fails if instructor and signatory are the same person
  (app check plus a trigger on `ra_demo_state`).
- Dual-control release succeeds when D. Martina instructs and A. Sambo signs.
- Independent approval moves under-review offer MRA-004 to funding.
  Related-party disclosure is on live offer MRA-001, not on MRA-004.
- Create offer saves a new draft (MRA-007 in the walkthrough; Reset removes it).
- Payer language toggle switches English / Dutch / Papiamentu copy.
- Payer can confirm the next Cg 1,800.00 payment.
- Overview Reset demo asks to confirm, then restores the six seeded offers.

## 3. Database `[LABS]`

Allowed project only: `csaefdkpwukshtouyixg`.

Migration `supabase/migrations/20260814120000_rent_advance_rebuild.sql` dropped
the old listing / pipeline tables and created `ra_*` tables with RLS on and no
`anon` / `authenticated` grants. Demo state is stored in `ra_demo_state` and
seeded on first load. Service role is server-only.

A later Labs migration, `20260814140000_ra_demo_state_dual_control.sql`, adds a
trigger that rejects same-person releases inside that JSON book.

## 4. What was removed from this repo

- Python scrapers and the property pipeline
- Browse / listings / enrichment / What Fits Me dashboard pages
- Listing-specific GitHub Actions
- Root Python package and tests
- The nested `apps/labs-dashboard` app (the demo is now the repository root)
- Login, Settings, admin cookie, readiness, audit, and extra payer subpages
- Historical listing migrations from the working tree

## 5. What this is not

- Not live on merkado.cw
- Not a loan, yield product, fund, or public offering
- Not a wallet or USDC product
- Not authorised for third-party subscribe until M.1.2 and M.1.4 are closed
  in writing
