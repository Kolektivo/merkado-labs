# 05 - Architecture

**Purpose:** How the Labs demo is put together.
**Last updated:** August 18, 2026

## 1. Surfaces

```
merkado-labs
├── src/                    Next.js demo (shadcn)
├── supabase/migrations     Labs schema only (no new migration for this demo)
└── docs/                   Canonical product docs
```

merkado-cw is the live marketplace. This repo does not scrape, enrich, or
publish listings.

Customer-facing surfaces:

- `/` Labs demo hub
- `/originate*` Merkado Direct operations (My Offers, Create Offer, Get Now)
- `/offers*` Marketplace
- `/portfolio*` Portfolio
- `/pay` and `/pay/[paymentRequestId]` Merkado Pay
- `/account`, `/account/payments`, `/account/apps` fictional account mock

## 2. Dashboard

- Server components load one demo book from Labs Supabase (`ra_demo_state`)
  with a seed fallback and `normalizeBook()` for older JSON.
- Mutations are server actions (record collection, dual-control release,
  save draft, confirm mocked payment, reset).
- The demo is open. There is no login. Reset demo sits on Overview.
- Pay uses a payment-link shell (`src/app/pay/layout.tsx`). Account uses
  its own Labs mock shell. Direct operations use the sidebar shell
  (`src/app/(direct)/layout.tsx`). The three shells are separate layouts
  so the first paint does not swap chrome.

## 3. Pricing and scores

The pricing engine lives in TypeScript (`src/lib/rent-advance/pricing.ts`).
It is the only path that can create a quote. The 24% cap is enforced there,
not only in the UI.

Pricing uses **raw Listing Score** and **Payer Score**. The derived
**Property Score** (`src/lib/rent-advance/property-score.ts`) is for
Direct presentation and filtering only. Never feed it back into the engine.

## 4. Data

Labs project `csaefdkpwukshtouyixg` only. RLS on. `anon` / `authenticated`
have no grants. Service-role is server-only.

The live demo book is one JSON row in `ra_demo_state`. A trigger on that
payload rejects same-person releases. Purchaser pages load an anonymised
card, not the full payer file.

Structured `ra_*` tables exist with RLS on for a later normalised store.
This walkthrough does not write them.

Receivables, collections, payment requests, and distributions are separate
on purpose. A confirmed Pay event updates them once through an idempotent
helper.

## 5. Mock crypto boundary

UI does not call mock wallet functions directly. It uses a typed provider
(`src/lib/pay/provider.ts`) with a mock adapter
(`src/lib/pay/mock-provider.ts`). No wallet or Safe dependency is
installed. Network, chain ID, USDC contract, Safe address, and explorer
base URL are data-driven and may be unset.

## 6. Future home

Intended public hosts (direction only, not a deploy permission):
`direct.merkado.cw` and `pay.merkado.cw`. Optional env vars may point Apps
cards at those hosts later. Empty vars use working internal Labs routes.
Nothing in this repo deploys there yet.
