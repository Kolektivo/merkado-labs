# 04 - Design System

**Purpose:** Documented UI, UX, visual, and accessibility rules for Merkado Labs
surfaces. Factual only — no invented brand system. Gaps labeled `[OPEN]`.
**Last updated:** July 23, 2026

**Verified against** `apps/labs-dashboard` styles, tokens, and components
(read-only).

Related: `03-user-flows.md`, `06-data-model.md` (price presentation),
`apps/labs-dashboard/README.md`.

## 1. Scope

This document covers the **Labs dashboard** (`apps/labs-dashboard`). There is
**no** formal Merkado brand book or production property design system in this
repository.

`[OPEN]` Production merkado.cw property visual system, marketing brand tokens,
and cross-app component library.

## 2. Implementation stack (verified)

| Piece | Location / detail |
|---|---|
| Framework | Next.js App Router |
| Styling | Tailwind CSS v4 + CSS variables in `src/app/globals.css` |
| Components | shadcn/ui (`components.json`, style `radix-nova`, baseColor `neutral`, Lucide icons) |
| Fonts | Geist Sans + Geist Mono via `next/font/google` in `src/app/layout.tsx` |
| App chrome | `AppShell`, `PageHeader`, `SummaryStrip`, `StatusBadge`, `DataError`, `PrototypeNotice` |

## 3. Tokens and color

Semantic CSS variables are defined for light (`:root`) and `.dark` themes,
including `--background`, `--primary`, `--sidebar-*`, `--chart-*`, `--radius`,
and chart colors (oklch neutrals). Tailwind `@theme inline` maps these into
utilities.

`[OPEN]` Whether dark mode is a product-supported Labs setting (class tokens
exist; no documented theme-switch product decision).

`[OPEN]` Official Merkado brand palette / logo usage for property surfaces.

## 4. Typography

- Primary UI font: Geist Sans (`--font-sans`)
- Mono: Geist Mono (`--font-mono`)
- No separate display/marketing type scale is documented in-repo

`[OPEN]` Expressive brand typography for future marketing or merkado.cw property
pages.

## 5. Layout and navigation

- Primary shell groups: Monitor → Operate → Explore → System
  (`src/components/app-shell.tsx`)
- Skip link to `#main-content`; main landmark on page content
- Responsive behavior uses Tailwind breakpoints (`sm:`, `md:`, `xl:`) — no custom
  breakpoint map documented

`[OPEN]` Dedicated responsive layout spec (breakpoints, density, card vs table
rules) beyond implemented utilities.

## 6. Price and currency presentation (product rules)

Canonical policy lives in `06-data-model.md` → **Currency, pricing, and
normalization rules**. UI implications:

- Primary display currency: **XCG** with literal `Cg` prefix (not `Intl` XCG
  symbol — hydration-safe)
- Browse cards: XCG only
- Passport: XCG primary; original foreign asking may appear once in provenance
- Indicative tip/icon for true foreign→XCG conversions (not repeated body
  disclaimer under every price)
- Sold copy: `Last known listing price. The actual sale price may differ.`
- Implementation: `src/lib/domain/price-display.ts`,
  `src/components/price-display.tsx`

## 7. Public language and copy

- English is the default public website language for Browse / Passport / titles /
  summaries / filters / navigation / SEO
- About this property may offer English/Nederlands toggle when Dutch blocks exist
  — not full-site localization
- Required public strings: see `03-user-flows.md` §4.3
- Do not present AI as a consumer-facing feature on Passport
- Neighbourhood provenance labels may read: From source / Matched from map /
  Extracted from listing text / User provided
- Provenance classes: `Source fact`, `Merkado calculated`, `Merkado inferred`,
  `Verified record` (future only when real verification exists)

## 8. Accessibility patterns present

Verified in dashboard code:

- Skip link → `#main-content`
- `aria-label` / `aria-current` on primary navigation
- Section `aria-labelledby` on some pages (e.g. settings, quality)
- shadcn `sr-only`, breadcrumb semantics, alert `role="alert"`
- `focus-visible` rings on controls
- `prefers-reduced-motion` handling in `globals.css`

`[OPEN]` Full WCAG target level and formal a11y audit checklist for Labs and
future production property UI.

## 9. Cards, prototypes, and chrome

- Interactive surfaces use shadcn Card and related primitives where needed for
  ops tables, forms, and reviews
- Prototype journeys should surface `PrototypeNotice` (or equivalent) so Labs
  demos are not mistaken for merkado.cw production
- Empty and error states use shared empty/alert patterns rather than silent zeros
  when queries fail

## 10. What not to invent

Do not invent:

- purple/gradient “AI default” themes unrelated to existing tokens
- a second component library beside shadcn in this app
- production Auth UI patterns that are not implemented
