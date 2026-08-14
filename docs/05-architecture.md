# 05 - Architecture

**Purpose:** How the Labs demo is put together.
**Last updated:** August 14, 2026 (open demo at repository root)

## 1. Surfaces

```
merkado-labs
├── src/                    Next.js demo (shadcn)
├── supabase/migrations     Labs schema only
└── docs/                   Canonical product docs
```

merkado-cw is the live marketplace. This repo does not scrape, enrich, or publish listings.

## 2. Dashboard

- Server components load the demo book from Labs Supabase (`ra_demo_state`) with a seed fallback.
- Mutations are server actions (record collection, dual-control release, save draft, reset).
- The demo is open. There is no login. Reset demo sits on Overview.
- Payer routes use a narrow shell. Ops and holder routes use the sidebar shell.

## 3. Pricing

The pricing engine lives in TypeScript (`src/lib/rent-advance/pricing.ts`). It is the only path that can create a quote. The 24% cap is enforced there, not only in the UI.

## 4. Data

Labs project `csaefdkpwukshtouyixg` only. RLS on. `anon` / `authenticated` have no grants. Service-role is server-only.

The live demo book is one JSON row in `ra_demo_state`. A trigger on that
payload rejects same-person releases. Purchaser pages load an anonymised card,
not the full payer file.

Structured `ra_*` tables (`ra_offers`, `ra_receivables`, `ra_collections`,
`ra_releases`, checklist, questions, audit) exist with RLS on for a later
normalised store. This walkthrough does not write them. Do not treat empty
structured tables as a missing product.

Receivables and collections are separate on purpose.

## 5. Future home

The intended long-term surface is a Merkado app host such as `app.merkado.cw`. Nothing in this repo deploys there yet.
