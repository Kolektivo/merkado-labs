# 04 - Design System

**Purpose:** UI rules for the Labs Direct / Pay demo.
**Last updated:** August 18, 2026

## 1. Scope

This document covers the Labs Next.js demo at the repository root.
Production merkado.cw visual language stays in merkado-cw. Labs may
**mirror visual tokens only** on Pay, Account, Marketplace, and Portfolio.
Do not copy merkado-cw Navbar, AccountLayout data loading, auth, profiles,
or Listing Score implementation.

## 2. Stack (verified)

| Piece | Detail |
|---|---|
| Framework | Next.js App Router |
| Styling | Tailwind CSS v4 + CSS variables in `src/app/globals.css` |
| Components | shadcn/ui (`radix-nova`, `neutral`, Lucide) — one library only |
| Fonts | Geist Sans + Geist Mono on Direct ops; Inter on `.theme-merkado` surfaces |
| Chrome | `AppShell` sidebar for Direct; payment-link shell for Pay; account shell for the Labs account mock |

## 3. Tokens

**Direct operations** (My Offers, Create Offer, Get Now, offer detail) keep
the existing Labs light/dark semantic tokens.

**Marketplace, Portfolio, Pay, and Account** use a scoped `.theme-merkado`
layer:

- Page background `#FAF9F8`
- White surfaces; foreground `#171717`; surface-dark `#141414`
- Violet primary `#564EE4`
- Production violet, grey, success, warning, and error scales from
  merkado-cw `globals.css` (colour values only)
- Cards: subtle grey borders, 12–16px radii, restrained shadow
- Inputs around 40px high, 12px radius
- Motion: 160ms menu / 340ms panel, strong ease-out, `prefers-reduced-motion`

Account shell: mobile stack; desktop `280px + minmax(0,1fr)` with 16px gap
and `max-width: 1030px`. Sidebar: white, grey-200 border, 16px radius,
20px mobile / 24px desktop padding, 40px rows, 12px radius, active grey-100.

Do not invent a second component library or a generic “fintech” theme
outside this scoped layer.

## 4. Naming on screens

- Umbrella: **Merkado Direct**
- Renter link: **Merkado Pay**
- Account: visible **Demo account** label
- Money in Direct ops: `Cg` prefix, integer cents underneath, XCG as the
  currency name
- Money in Pay / My Payments: USDC primary, XCG supporting
- Overview carries the prototype notice. Other Direct pages use the header
  badge “Labs demo · not live on merkado.cw”
- Customer scores: **Listing Score** and **Property Score**, not Passport
- Dense terms use tooltips and disclosure, not paragraph walls

## 5. Accessibility

Skip link to `#main-content`, `aria-current` on nav, focus-visible rings,
`prefers-reduced-motion` in `globals.css`. Pay is mobile-first (~390px).
The amount and wallet action come before the unchanged-lease list.
Payment status uses `aria-live`. Sliders expose live value and band.
Touch targets stay comfortable. Explorer links (when configured) and
external app URLs include accessible new-tab text.

## 6. What not to invent

No gradients-as-brand, no real wallet chrome, no “yield” badges, no loan
calculators labeled as loans, no Claim button, no invented explorer URL,
no Base-as-default network label.
