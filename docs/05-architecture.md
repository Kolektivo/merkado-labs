# 05 - Architecture

**Purpose:** How the Labs demo is put together.
**Last updated:** August 21, 2026 (payout-first, whole-offer flow)

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
- `/originate*` Merkado Direct operations (My Offers, Create Offer, Simulator)
- `/admin*` operations (approval, collections, reset)
- `/offers*` Marketplace
- `/portfolio*` Portfolio
- `/pay` and `/pay/[paymentRequestId]` Merkado Pay. `/pay/payments` redirects to `/pay`.
- `/account` → `/account/apps` fictional account mock (Apps launcher) inside
  merkado-cw navbar / sidebar / footer chrome. **Account Settings** stays
  visible but inactive. There is no Payouts item. Other account links are
  disabled. `/account/payouts` and `/payouts` redirect to My Offers.

## 2. Dashboard

- Server components load one demo book from Labs Supabase (`ra_demo_state`)
  with a seed fallback and `normalizeBook()` for older JSON.
- Mutations are server actions (record collection, dual-control release,
  submit for review, whole-offer purchase, holder claim, confirm mocked
  payment, reset).
- There is no Merkado login. After deploy, the hosted demo asks for a
  shared host password at `/enter`. Reset the book sits in Admin.
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

The persisted Labs book is one JSON row in `ra_demo_state`. A trigger on that
payload rejects same-person releases. Purchaser pages load an anonymised
card, not the full payer file.

Structured `ra_*` tables exist with RLS on for a later normalised store.
This walkthrough does not write them.

Receivables, collections, payment requests, and distributions are separate
on purpose. A confirmed Pay event updates them once through an idempotent
helper.

Each offer stores its payout selection, publication time, and 60-day
`expiresAt` inside the existing JSON payload. `normalizeBook()` fills these
fields for older books. No schema migration is required. Bank/Sentoo form
values are client-only previews and are not persisted.

## 5. Mock crypto boundary

UI does not call mock wallet functions directly. It uses
`createPaymentProvider()` (`src/lib/pay/create-provider.ts`) against
`PaymentProvider` (`src/lib/pay/provider.ts`). The current adapter is
still the mock (`src/lib/pay/mock-provider.ts`). No wallet or Safe
dependency is installed. `PAYMENT_RAIL_MODE` in `src/lib/pay/mode.ts`
is `"mock"` and drives Overview / Pay labels. Flip it to `"live"` in
the same change that replaces the factory. Demo `cryptoConfig` defaults
to **Base Sepolia** with Circle native USDC. Admin shows that Base
testnet now. **Base Mainnet** is later and stays hidden unless
`NEXT_PUBLIC_PAY_NETWORK` is `base-mainnet`. Optimism networks stay in
the catalog if Luis later opts in; they are not shown in Admin.
`cryptoConfig` now holds a company Safe, a sales proceeds Safe, and an
offer factory address. They stay fictional on `main` until Luis replaces
them. Merkado creates **one listing offer per listing** so the product
can track and later resell it, without Merkado holding monthly rent.
After a sale, Pay uses that listing’s collection address, not the
company Safe. The holder connects the mocked demo wallet and **claims** rent
from Portfolio. The whole-offer purchase marks landlord proceeds paid
automatically to the address saved before submission. The landlord never
connects a wallet and never sees a claim button, mock hash, or explorer link.
Marketplace and Portfolio show a reusable **Connect wallet** mock; they do
not import WalletConnect or Privy. Pay renders the mock stablecoin payload as a
QR, confirms with **I’ve sent this payment** only, and keeps Sentoo as a
collapsed client-only preview. Explorer links
render only for a real 64-hex transaction hash on an official catalog
explorer. Draft PRs 19, 20, and 22 stay unmerged on Luis’s stack. See
ADR-0006.

## 6. Future home

Intended public hosts (direction only, not a deploy permission):
`direct.merkado.cw` and `pay.merkado.cw`. Optional env vars may point Apps
cards at those hosts later. Empty vars use working internal Labs routes.
Nothing in this repo deploys there yet.
