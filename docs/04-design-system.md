# 04 - Design System

**Purpose:** UI rules for the Labs Direct / Pay demo.
**Last updated:** August 19, 2026 (hosted password door)

## 1. Scope

This document covers the Labs Next.js demo at the repository root.
Production merkado.cw visual language stays in merkado-cw. The Labs
**account mock** now mirrors merkado-cw navbar, footer, and account
sidebar chrome visually. Do not copy AccountLayout data loading, auth,
profiles, or Listing Score implementation. Marketplace, listing, billing,
and settings controls are visibly disabled. Admin is not shown.
Only Merkado Pay and Merkado Direct are live. Payment history lives on
the Pay page.

## 2. Stack (verified)

| Piece | Detail |
|---|---|
| Framework | Next.js App Router |
| Styling | Tailwind CSS v4 + CSS variables in `src/app/globals.css` |
| Components | shadcn/ui (`radix-nova`, `neutral`, Lucide) — one library only |
| Fonts | Geist Sans + Geist Mono on Direct ops; Inter on `.theme-merkado` surfaces |
| Chrome | Standalone Merkado-themed door at `/enter`; `AppShell` sidebar for Direct; payment-link shell for Pay; account shell for the Labs account mock |

## 3. Tokens

**Direct operations** (My Offers, Create Offer, Get Now, offer detail) keep
the existing Labs light/dark semantic tokens.

**Marketplace, Portfolio, Pay, Account, and the hosted password door
(`/enter`)** use a scoped `.theme-merkado` layer:

- Page background `#FAF9F8`
- White surfaces; foreground `#171717`; surface-dark `#141414`
- Violet primary `#564EE4`
- Production violet, grey, success, warning, and error scales from
  merkado-cw `globals.css` (colour values only)
- Cards: subtle grey borders, 12–16px radii, restrained shadow
- Inputs around 40px high, 12px radius
- Motion: 160ms menu / 340ms panel, strong ease-out, `prefers-reduced-motion`

Account shell matches merkado-cw page chrome: top nav (logo, Cars, Real
Estate, My account, Create a listing), Home / My Account / Apps breadcrumb,
`max-width: 1030px`, `px-4 pb-4 pt-0`, desktop `280px + minmax(0,1fr)`,
and the dark footer pinned to the bottom of the screen on short pages,
matching merkado-cw. Sidebar groups are Marketplace, **Apps**, then Account.
Admin is hidden. Disabled chrome uses a muted not-available treatment.
**Merkado Pay** and **Merkado Direct** are clickable in the Apps group,
the My account menu, and on the Apps page. Logo and Home return to the
Labs Overview.

Marketplace offer cards use merkado-cw listing-card chrome: 12px radius,
grey-200 border, 3:2 photo, 18px title, icon spec row, and a top-border
price block. Labs fields stay on the card (status, term, Property Score,
payer band, amount taken). The whole card opens the offer. No tenant
name, street, employer, or income.

Do not invent a second component library or a generic “fintech” theme
outside this scoped layer.

## 4. Naming on screens

- Umbrella: **Merkado Direct**
- Renter link: **Merkado Pay**
- Account: visible **Private seller** label with **Luuk Weber** and the
  supplied demo avatar
- Money in Direct ops: `$` prefix, integer cents underneath, USD as the
  currency name
- Money in Pay: USDC primary, USD rent as the matching lease amount (1:1)
- Apps **Open Pay** opens this month’s payment page, which includes
  payment history.
- Overview carries the prototype notice. Other Direct pages use the header
  badge “Labs demo · not live on merkado.cw”
- The hosted password door (`/enter`) is a single calm card: Merkado mark,
  **Private walkthrough**, **Merkado Labs**, **Shared password**, and a
  quiet “not a Merkado account” footer. No prototype alert stack.
- Customer scores: show **Property quality**, **Payment history**, and
  **Combined property view**. Official names Listing Score, Payer Score,
  and Property Score stay inside tooltips only.
- Prefer **Rent vs typical rent**, **Connected landlord**, **Yearly
  comparison**, and **Share paid now** over rent-to-market, related-party,
  effective annualised, and advance rate.
- Dense terms use tooltips and disclosure, not paragraph walls

## 5. Accessibility

Skip link to `#main-content`, `aria-current` on nav, focus-visible rings,
`prefers-reduced-motion` in `globals.css`. The password door uses a
40px-tall field, a show/hide control, and a full-width continue action.
Pay is mobile-first (~390px).
The amount, due badge, copy details, both pay actions, and payment
history stay visible. Extra explainers stay in tooltips. Pay is
English-only.
Payment status uses `aria-live`. Sliders expose live value and band.
Touch targets stay comfortable. Explorer links (when configured) and
external app URLs include accessible new-tab text.

## 6. What not to invent

No gradients-as-brand, no real wallet chrome, no “yield” badges, no loan
calculators labeled as loans, no Claim button, no explorer link for demo hashes,
no Base-as-default network label. OP Sepolia is the default demo
network. Base Sepolia is an available testnet. Mainnet is later.
