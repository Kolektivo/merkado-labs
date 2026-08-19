# 09 - Current Product State

**Purpose:** Ground truth. Nothing may be described as live unless it is available on `merkado.cw`.
**Last updated:** August 19, 2026 (local automated verification re-run; GitHub CI pending)

**Labs rebuild (2026-08-14 Product Lead):** Merkado Labs is no longer the
property-scraper kitchen. That work lives on **merkado-cw**. This repository is
the working **Merkado Direct + Merkado Pay** Buildathon demo. The Next.js app
lives at the repository root. There is no login.

This demo is **not** live on merkado.cw. It may later sit at a surface such as
`app.merkado.cw`. There is no public offering. Wallet and USDC payments are
**mocked**. Direct operations stay in XCG.

merkado-cw remains the live cars + real-estate marketplace. Its **Property
Passport** is listing history on a property page. This demo’s **Listing Score**
is the raw underwriting input. **Property Score** is a derived presentation
figure. They are different products.

## 1. Production today `[LIVE]`

Merkado on merkado.cw remains the Curaçao marketplace. Cars, listings, scrapers,
and public browse are owned by **merkado-cw**. This Labs repo does not operate
them.

Live production does **not** currently include Merkado Direct or Merkado Pay as
a public product.

## 2. Labs demo today `[LABS]`

Local automated checks were re-run from the repository root on 2026-08-19
after the verification cleanup: `npm ci`, lint, typecheck, unit tests, and
production build all passed. Unit tests now import the real application
modules. GitHub Actions verification is in the repository
(`.github/workflows/verify.yml`) but has **not** run remotely yet — treat
CI as pending until a Product Lead-approved push.

The 2026-08-18 browser walkthrough still stands for product behaviour. The
demo is open. No login, settings, or admin page.

| Surface | What a visitor sees |
|---|---|
| Overview `/` | Merkado Labs demo hub. Doors for Direct, Pay, and the account mock, plus Reset. No prominent “Merkado Rent Advance” brand. |
| My Offers `/originate` | Live and collecting offers appear first; drafts sit lower. Get Now and Create Offer as the obvious next steps. Advance totals exclude drafts, under-review, and unfunded rows. |
| Create offer `/originate/new` | Six-step wizard. “Listing Score” replaces the old Passport step. A Get Now quote can prefill via `?quote=1&rent=&market=&listing=&payer=&related=&months=` and opens on Quote. Only six months can be saved. |
| Get Now `/originate/simulator` | Rent, estimated market rent, related-party, Listing Score and Payer Score sliders, live Property Score, 3 months disabled, 6 months approved, 9/12 simulation-only. Copy quote and Use this quote. Cap quotes cannot be saved. |
| Offer detail `/originate/MRA-*` | One-time settlement reference. Later rent shows collected / pending distribution / distributed. Landlord is not paid again. Approval, collections, and dual-control remain. |
| Marketplace `/offers` | Anonymised photo cards; **Property Score** (derived); subscribe closed. No tenant name, employer, street, agency, or income. |
| Portfolio `/portfolio` | Stable Position IDs. Collected / awaiting release / distributed. Automatic distributions. No Claim. Truncated hash with copy of the full value. Explorer link only if a base URL is set. |
| Pay `/pay` → `/pay/[paymentRequestId]` | Mocked USDC payment-link. Canonical seeded request `payreq-mra-001-202609`. `/pay` opens the next unpaid renter request. A later month cannot be paid while an earlier month is still open. Amount and Connect wallet sit above the unchanged-lease list. Unknown IDs show a friendly not-found with no other payment data. English / Nederlands / Papiamentu. |
| Account `/account` → `/account/payments`, `/account/apps` | Fictional Labs renter (L. Rosaria). Demo account label. My Payments next-payment card and history. Apps cards for Pay and Direct with internal fallbacks. |

Old URLs (`/login`, `/settings`, `/originate/readiness`, `/pay/home`, and the
other retired payer subpages) still redirect. `/pay/history` is not reused.

### Locked MRA-001 figures (verified)

- Monthly rent **Cg 1,800.00** (180000 cents)
- Estimated market rent **Cg 3,000.00** (rent-to-market **0.60**)
- Term **6 months**
- Gross receivables **Cg 10,800.00**
- Fee **5.50% = Cg 594.00**
- Purchase price **Cg 10,206.00**
- Effective annualised **≈ 21.6%** (under the 24% hard cap)
- Listing Score **89** (pricing input). Derived Property Score **98**.
- Current Pay request: **1,005.59 USDC** (atomic `1005586592`) beside Cg 1,800.00
- Network label when unset: **Network to be confirmed** (never defaulted to Base)

A weak-score + related-party quote is blocked by the 24% cap. Use this quote
stays disabled. There is no override.

### Shared demo book (verified)

One JSON book in `ra_demo_state.payload`. Confirming Pay once writes the
payment request as paid, the receivable as received, one collection, an
automatic holder distribution, and ledger rows. Refreshing or retrying the
same request does not duplicate collection or distribution.

After the September Pay confirmation in the walkthrough:

- My Payments next card moved to **October 2026**
- My Offers MRA-001 showed **Collected Cg 1,800.00 · distributed Cg 1,800.00**
- Portfolio `pos-mra-001` showed the same collection as **Distributed**
- Revisiting `/pay/payreq-mra-001-202609` stayed on **Rent paid**

Reset restores the seeded offers, payments, transactions, and distributions.

### Privacy walls (verified in the browser)

- Marketplace shows a property photo, district, Property Score, payer band,
  and term. No tenant name, employer, street address, agency, or income
  figure. Rent-to-market is inside the Property Score, not published as a
  standalone marketplace figure.
- Subscribe is closed and does not complete a purchase.
- Drafts are not shown as marketplace offers.
- Pay and account show rent to the property, USDC + XCG, due date, and a
  fictional receiving address. No fee, purchase price, holder, or
  distribution economics.
- Holder pages stay district-only. Street address is off those screens.
- Invalid Pay links do not reveal other payment requests.

### Working demo actions (verified)

- Get Now 9/12 months can be simulated; Use this quote stays disabled.
- Use this quote prefills Create Offer on the Quote step with the locked
  MRA-001 six-month figures when defaults are used.
- Record collection is offered only on live, collecting, or defaulted offers
  and uses the same stable collection IDs as Pay.
- Dual-control release remains on ops for collections that are still waiting.
  Pay-confirmed collections are auto-distributed and do not re-queue release.
- Dual-control still rejects the same person twice (app check plus the trigger
  on `ra_demo_state`).
- Independent approval still moves under-review offer MRA-004 to funding.
- Create offer can save a new six-month draft (MRA-007 in the walkthrough;
  Reset removes it). 9/12 still cannot be saved.
- Payer language toggle switches English / Dutch / Papiamentu copy.
- Later-month Pay links stay readable but send the renter back to the next unpaid month.
- My Payments **Open** is the month due now (plus failed or overdue). **Upcoming** is later months only.
- Mock wallet: disconnected → connected → confirm → pending → Rent paid.
- Failed and incorrect-amount outcomes can be selected in the demo panel.
- Overview Reset demo asks to confirm, then restores the seeded book.

### Mock crypto boundary (Labs only)

UI talks to `src/lib/pay/provider.ts`. The only implementation in this task is
`src/lib/pay/mock-provider.ts`. There is no wallet, Safe, RPC, or USDC SDK.
Luis/Luuk own the later network, Safe, and USDC contract decisions. See
`docs/07-integrations.md` and ADR-0005.

## 3. Database `[LABS]`

Allowed project only: `csaefdkpwukshtouyixg`.

Migration `supabase/migrations/20260814120000_rent_advance_rebuild.sql` dropped
the old listing / pipeline tables and created `ra_*` tables with RLS on and no
`anon` / `authenticated` grants. Demo state is stored in `ra_demo_state` and
seeded on first load. Service role is server-only.

A later Labs migration, `20260814140000_ra_demo_state_dual_control.sql`, adds a
trigger that rejects same-person releases inside that JSON book.

The Buildathon book extension (accounts, payment requests, ledger,
distributions, positions, crypto config) lives **inside the existing JSON
payload**. No new migration was applied. A failed Labs read no longer
overwrites the live book with seed.

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
- Not a real wallet, Safe, or USDC product
- Not authorised for third-party subscribe until M.1.2 and M.1.4 are closed
  in writing
- Not a token, NFT, or secondary market
