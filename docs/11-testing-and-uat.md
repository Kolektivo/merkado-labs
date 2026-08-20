# 11 - Testing and UAT

**Purpose:** How we verify the Direct / Pay Buildathon demo.
**Last updated:** August 20, 2026 (Base Sepolia / Base Mainnet)

## Automated

From the repository root:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

Unit tests import the real application modules. They must fail if pricing,
Property Score, payment book, app-link, or host-gate behaviour changes
incorrectly.

Pricing tests must reproduce MRA-001 locked figures and the 24% block.
Property Score tests must cover band boundaries, clamping, invalid market
rent, the 0.60 → 1.10 example, and proof that derived Property Score does
not change quote pricing. Payment tests must prove one confirmation cannot
duplicate collection or distribution. App-link tests must prove external
HTTPS URLs open externally and missing or invalid URLs stay inside the demo.

GitHub Actions runs the same commands via `.github/workflows/verify.yml`.
The first passing remote run on `main` was 2026-08-19 (run 32228015203).

## Critical flows (engineering)

1. Home shows Merkado Direct entry points. No Merkado login. Reset lives
   in Admin. After deploy, the hosted URL first shows the shared password
   page.
2. Direct nav is Home, My Offers, Create Offer, Simulator, Marketplace,
   Portfolio, plus Pay, Account, and Admin at the bottom.
3. My Offers lists the two seeded offers (**MRA-001** and **MRA-010**);
   draft/unfunded rows are not counted as cash already advanced.
4. Simulator: Listing Score and Payer Score sliders; market rent in XCG;
   Property Score; 3 months disabled; 9/12 simulation-only; Use this quote
   disabled when unapproved or above 24%.
5. Use this quote prefills Create Offer. 9/12 cannot submit.
6. Offer detail: settlement card; later rent collected / awaiting /
   distributed. Operations controls are only in Admin.
7. Marketplace: no tenant name or address; a holder can buy any portion
   still open; Property Score is the derived figure.
8. Portfolio: Position ID; collected / pending / distributed; no Claim.
9. Pay: seeded request **XCG 3,222.00** / **1,800.00 USDC** on the selected
   network (**Base Sepolia** after Reset); copy-address and mock wallet
   paths; visible pending then success; invalid id is a safe not-found.
10. One confirmed payment appears once in Pay history, My Payments, offer
    collections, and holder distribution. Refresh does not duplicate.
11. Apps cards have working internal fallbacks and accessible new-tab
    behaviour only for absolute URLs.
12. Customer screens do not show a sale-not-loan wall, fee buildup, or
    extra comparison figures. Those live in Admin if needed.

## Product Lead walkthrough

Do this on http://localhost:3000 after `npm run dev`. Local has no password
unless you set one. After the host-password change is deployed, enter the
shared password first on the hosted URL.
Judge copy, clarity, and whether a landlord or tenant would misunderstand
this as a loan. After each item, reply with what you saw if it felt wrong.

### Before you start

Open **Admin** at the bottom of the left nav. Click **Reset the book** and
confirm **Yes, reset**.

### 1. Home

- The page says **Merkado Direct** / **Rent paid forward**.
- Featured Marketplace cards are visible. Buttons are violet, not black.
- You do **not** see a long sale-not-loan box, Reset, or legal questions.

### 2. Simulator

- Monthly rent shows **3222.00** XCG. Typical nearby rent shows **5370.00**.
- Property quality 89 and Payment history 95 are sliders with live numbers.
- Click **Small studio**. Rent becomes **1.79**. The cash to the
  landlord is about **XCG 10.17**.
- 3 months is disabled. 6 months can use the quote.

### 3. Create offer and Admin

- From the XCG 10 example, click **Use this quote**.
- Add a cover photo if you want. On Review, there is no “connected to
  Merkado” checkbox. Click **Submit for review**.
- Open **Admin** at the bottom of the left nav. Open the new offer.
  Click **Approve offer**.

### 4. Marketplace and Portfolio

- Open **Marketplace**. You see two cards with **XCG** amounts and photos:
  the funded Sun Set Heights house and the open **Punda** studio.
- Open the **Punda** studio (**MRA-010**). Enter a smaller amount or click
  **25%**, then **Purchase**. You land on Portfolio. The studio should
  still show some amount open.
- Open the same studio again. Click **All remaining**, then **Purchase**,
  so Pay can mint the XCG 1.79 rent.
- There is no Claim button.

### 5. Pay rent

- Open **Merkado Pay**. You see a list. MRA-001 is **XCG 3,222.00**.
  After purchasing MRA-010, a **XCG 1.79** rent also appears.
- Open the XCG 1.79 payment. You still confirm with the mocked wallet or
  **I’ve sent this payment**. Settlement note shows **1.00 USDC**.
- After it is paid, Portfolio for that position shows the collection.
- Copy the address, then click **I’ve sent this payment**. You should see
  a pending state, then **Rent paid**.
- Reset, then walk Connect wallet → Pay with demo wallet → pending →
  Rent paid. Rent and lease stay unchanged. The button still says
  **Pay with demo wallet** while payments are mocked. After Luis flips
  `PAYMENT_RAIL_MODE` to `"live"`, that button should say **Pay with
  wallet** and the footer should no longer say the walkthrough does not
  send a real transfer. Pay should already show **Base Sepolia**. Base
  Mainnet stays off until you turn it on.
- A later month (for example November) says to pay the earlier month first.
- You never see a fee, holder name, or distribution figure.
- Refresh the success page. The payment is still there once.

### 7. Account Apps and Pay

- Account looks like merkado.cw account: same logo, top nav, footer,
  breadcrumb, and left nav groups. The profile is **Luuk Weber** with the
  photo avatar. There is no Admin item. **Apps** sits above **Account**.
  Marketplace, Plan & Billing, Account Settings, Cars, Real Estate,
  Create a listing, and Log out look disabled. Only **Merkado Pay** and
  **Merkado Direct** are clickable. There is no My Payments row in Account.
- Open **Merkado Pay**. The same page has this month’s payment and
  **Payment history** underneath. There is no second payments page.
- Direct opens the landlord walkthrough. If no external URL is configured,
  both apps stay inside this demo.
- On a phone, the top menu and left account nav show the same links.
  Only **Merkado Pay** and **Merkado Direct** are clickable.

### 8. Reset

- Open **Admin**. **Reset the book** restores the two seeded offers
  (**MRA-001** and the cheap Punda studio), payments, and distributions.
  The payment network you selected stays.

### What you are judging

- Would a landlord think this is a loan?
- Would a renter think their lease or rent changed?
- Would a holder think they can buy in today, or that collections are
  guaranteed?
- Is the live demo easy to explain?

If everything looks correct, reply: `Approved, commit and push.`
