# 05 - Architecture

**Purpose:** How the Labs demo is put together.
**Last updated:** August 20, 2026 (Base Sepolia / Base Mainnet)

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
  merkado-cw navbar / sidebar / footer chrome. Other account links are disabled.

## 2. Dashboard

- Server components load one demo book from Labs Supabase (`ra_demo_state`)
  with a seed fallback and `normalizeBook()` for older JSON.
- Mutations are server actions (record collection, dual-control release,
  submit for review, confirm mocked payment, reset). PR #21 adds the
  landlord claim server actions (`startLandlordProceedsClaimAction`,
  `completeLandlordProceedsClaimAction`, `failLandlordProceedsClaimAction`)
  in `src/lib/rent-advance/actions.ts`, built on the mock apply helpers in
  `src/lib/rent-advance/payment-apply.ts`.
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

The live demo book is one JSON row in `ra_demo_state`. A trigger on that
payload rejects same-person releases. Purchaser pages load an anonymised
card, not the full payer file.

Structured `ra_*` tables exist with RLS on for a later normalised store.
This walkthrough does not write them.

Receivables, collections, payment requests, and distributions are separate
on purpose. A confirmed Pay event updates them once through an idempotent
helper.

Settlement is `settlementMode`-aware. An `"automatic"` offer (MRA-001) gets
a derived `advance_settlement` ledger row on full funding. A
`"landlord_claim"` offer (MRA-010 and every newly created offer) instead
records an **OfferFundingRecord** (**mock funding recorded**) and creates a
`LandlordProceedsClaim` in `available` when fully funded; the mocked
`landlord_proceeds_claim` ledger row is written only when the claim is
`paid`. No claim-mode offer records an automatic `advance_settlement`
during normalization.

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
The verified Base Sepolia deposit Safe
(`0xfC6ec9718d89d4935594E7DB78399913071FcDc4`) is in
`cryptoConfig.safeAddress`. Explorer links render only for a real
64-hex transaction hash on an official catalog explorer.

The renter payment rail is untouched by PR #21: the mock
`PaymentProvider`, `PAYMENT_RAIL_MODE`, and PR #20's
`ra_payment_verifications` idempotency all stay as they are. The
landlord proceeds claim is a separate in-book mock allocation and is
never verified against the chain or written to `ra_payment_verifications`.

## 6. Future home

Intended public hosts (direction only, not a deploy permission):
`direct.merkado.cw` and `pay.merkado.cw`. Optional env vars may point Apps
cards at those hosts later. Empty vars use working internal Labs routes.
Nothing in this repo deploys there yet.
