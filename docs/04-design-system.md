# 04 - Design System

**Purpose:** UI rules for the Labs Rent Advance demo.
**Last updated:** August 14, 2026

## 1. Scope

This document covers the Labs Next.js demo at the repository root. Production merkado.cw visual language stays in merkado-cw.

## 2. Stack (verified)

| Piece | Detail |
|---|---|
| Framework | Next.js App Router |
| Styling | Tailwind CSS v4 + CSS variables in `src/app/globals.css` |
| Components | shadcn/ui (`radix-nova`, `neutral`, Lucide) |
| Fonts | Geist Sans + Geist Mono |
| Chrome | `AppShell`, `PageHeader`, `SummaryStrip`, `StatusBadge`, `PrototypeNotice` |

## 3. Tokens

Keep the existing light/dark semantic tokens. Do not invent a purple “fintech” theme. Do not add a second component library.

## 4. Naming on screens

- Landlord / ops screens: **Merkado Rent Advance**
- Holder screens: **Merkado Direct**
- Never both product names on one role screen. The Labs sidebar (and Overview
  doors) list both only so a demo walkthrough can switch roles.
- Money: `Cg` prefix, integer cents underneath, XCG as the currency name
- Overview carries the prototype notice. Other pages use the header badge
  “Labs demo · not live on merkado.cw”. Dense terms use tooltips, not
  paragraph walls.

## 5. Accessibility

Skip link to `#main-content`, `aria-current` on nav, focus-visible rings, `prefers-reduced-motion` in `globals.css`. Payer shell is narrow and mobile-first.

## 6. What not to invent

No gradients, no crypto wallet chrome, no “yield” badges, no loan calculators labeled as loans.
