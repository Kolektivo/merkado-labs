# 04 - Design System

**Purpose:** UI rules for the Labs Direct / Pay demo.
**Last updated:** August 21, 2026 (Base Sepolia transferable NFT rent offer)

## 1. Scope

This document covers the Labs Next.js demo at the repository root.
Production merkado.cw visual language stays in merkado-cw. The Labs
**account mock** now mirrors merkado-cw navbar, footer, and account
sidebar chrome visually. Do not copy AccountLayout data loading, auth,
profiles, or Listing Score implementation. Marketplace, listing, and billing
controls are visibly disabled, including **Account Settings**. There is
no Payouts item in account chrome. Admin is not shown.
Only Merkado Pay and Merkado Direct are live apps. Payment history lives on
the Pay page.

## 2. Stack (verified)

| Piece | Detail |
|---|---|
| Framework | Next.js App Router |
| Styling | Tailwind CSS v4 + CSS variables in `src/app/globals.css` |
| Components | shadcn/ui (`radix-nova`, `neutral`, Lucide) — one library only |
| Fonts | Geist Sans + Geist Mono on Direct ops; Inter on `.theme-merkado` surfaces |
| Chrome | Compact shadcn card at `/enter`; `AppShell` sidebar for Direct, with a header notifications bell and nav counts on My Offers / Portfolio; payment-link shell for Pay; account shell for the Labs account mock |

## 3. Tokens

**Direct operations** (My Offers, Create Offer, Simulator, offer detail, Admin)
use Merkado violet as the primary action colour.

**Marketplace, Portfolio, Pay, and Account** use a scoped `.theme-merkado`
layer:

- Page background `#FAF9F8` on standalone Pay and Account shells.
  Inside the Direct sidebar, `.theme-merkado` keeps tokens and type but
  does not paint a second canvas over the shared page background.
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
the My account menu, and on the Apps page. **Account Settings** stays
visible but inactive. Logo and Home return to the Labs Home.

Marketplace offer cards use merkado-cw listing-card chrome: 12px radius,
grey-200 border, 3:2 photo, 18px title, icon spec row, and a top-border
price block. Labs fields stay on the card (status, term, Property Score,
payer band, whole-offer price, and availability deadline). The whole card opens the offer. No tenant
name, street, employer, or income.

Do not invent a second component library or a generic “fintech” theme
outside this scoped layer.

## 4. Naming on screens

- Umbrella: **Merkado Direct**
- Renter link: **Merkado Pay**
- Account: visible **Private seller** label with **Luuk Weber** and the
  supplied demo avatar
- Money in Direct ops: **XCG** prefix (1.79 to the dollar)
- Money in Pay: XCG primary, USDC as the settlement amount (1:1 with stored USD rent)
- Apps **Open Pay** opens this month’s payment page, which includes
  payment history.
- Customer screens stay quiet. Reset, payment network, and fee buildup live
  on **Admin**. Buttons use Merkado violet, not near-black.
- Do not add a small page-level eyebrow or brand kicker above a clear page
  title. **Rent paid forward**, **My Offers**, and similar titles stand on
  their own. Field labels, status badges, nav groups, and the logo are not
  eyebrows.
- The hosted password door (`/enter`) is a compact shadcn card: title,
  one line of copy, **Shared password**, and **Continue**. No logo, pill,
  or prototype alert.
- When `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` is empty, Purchase and Pay
  show a quiet **not configured** state instead of a fake transaction.
- Customer scores: show **Property quality**, **Payment history**, and
  **Combined property view**. Official names Listing Score, Payer Score,
  and Property Score stay inside tooltips only.
- Prefer **Rent vs typical rent**, **Connected landlord**, **Yearly
  comparison**, and **Share paid now** over rent-to-market, related-party,
  effective annualised, and advance rate. **Connected landlord** is for
  landlord / Admin review only; it is not shown or sent to holders.
- Dense terms use tooltips and disclosure, not paragraph walls
- One primary task should visually lead each customer page. Use a restrained
  violet tint, primary-colour amount, or primary action to guide the eye;
  supporting cards stay neutral.
- Action buttons fill a narrow card (offer ticket) or a small screen.
  On a wide desktop page such as Portfolio, **Connect wallet** and
  **Claim rent** size to their label.
- Keep operational tables, filters, totals, payment history, and score detail
  behind a clearly labelled collapsed section when they are not required for
  the next action.
- Completed purchases and holder rent claims use one
  accessible success dialog with a check mark, plain-language result, and the
  amount when it is useful.

## 5. Accessibility

Skip link to `#main-content`, `aria-current` on nav, focus-visible rings,
`prefers-reduced-motion` in `globals.css`. The password door uses the
default shadcn field, a show/hide control, and a full-width continue
action. Pay is mobile-first (~390px).
The amount, due badge, wallet actions, and
payment history stay visible. Extra explainers stay in tooltips. Pay is
English-only.
Payment status uses `aria-live`. Sliders expose live value and band.
Touch targets stay comfortable. Explorer links (when configured) and
external app URLs include accessible new-tab text.

## 6. What not to invent

No gradients-as-brand, no "yield" badges, no loan calculators labeled as
loans, no explorer link for demo hashes. The **Landlord proceeds** card
uses Waiting (amber), Processing (blue), Failed (red), and Paid (quiet
grey). Paid is the sale completing; there is no
landlord claim button. Holder **Claim rent** is the current NFT owner's
action in Portfolio. Marketplace and Portfolio
use a standard wallet-connect control (Reown/AppKit (injected EIP-1193); WalletConnect
versus Privy is a later choice and is not shown). Pay has no Connect
wallet control. The Base Sepolia contract address comes from
`NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS`; an empty value shows a not-configured
state, never a fake hash. Explorer links open only for real 64-hex hashes.
**Base Sepolia** is the default demo network. **Base Mainnet** is later.
