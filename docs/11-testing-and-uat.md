# 11 - Testing and UAT

**Purpose:** How we verify the Direct / Pay Buildathon demo.
**Last updated:** August 19, 2026

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

1. Overview shows Direct, Pay, and Account doors. No Merkado login. Reset
   is here. After deploy, the hosted URL first shows the shared password
   page.
2. Direct nav is exactly My Offers, Create Offer, Get Now, Marketplace,
   Portfolio.
3. My Offers lists six offers; draft/unfunded rows are not counted as cash
   already advanced.
4. Get Now: Listing Score and Payer Score sliders; market rent; Property
   Score; 3 months disabled; 9/12 simulation-only; Use this quote disabled
   when unapproved or above 24%.
5. Use this quote prefills Create Offer. 9/12 cannot save.
6. Offer detail: mocked upfront settlement; later rent is not paid to the
   landlord again.
7. Marketplace: no tenant name or address; Subscribe is closed; Property
   Score is the derived figure.
8. Portfolio: Position ID; collected / pending / distributed; no Claim.
9. Pay: seeded request **1,800.00 USDC** and $1,800 rent on the selected
   network (**OP Sepolia** after Reset); copy-address and mock wallet
   paths; visible pending then success; invalid id is a safe not-found.
10. One confirmed payment appears once in Pay history, My Payments, offer
    collections, and holder distribution. Refresh does not duplicate.
11. Apps cards have working internal fallbacks and accessible new-tab
    behaviour only for absolute URLs.
12. Sale explainer never uses interest rate, debt, or borrow — only
    “not a loan.”

## Product Lead walkthrough

Do this on http://localhost:3000 after `npm run dev`. Local has no password
unless you set one. After the host-password change is deployed, enter the
shared password first on the hosted URL.
Judge copy, clarity, and whether a landlord or tenant would misunderstand
this as a loan. After each item, reply with what you saw if it felt wrong.

### Before you start

Click **Reset demo** on Overview and confirm **Yes, reset**.

### 1. Overview

- You see doors into Merkado Direct, Merkado Pay, and the demo account.
- The page does **not** prominently brand a separate Rent Advance product.
- MRA-001 still shows $1,800 rent, six months, $10,206 cash, 5.50%
  fee, ~21.6%.
- “Still open” lists the legal questions in plain language.
- Payment network shows **OP Sepolia** after Reset. You can switch to
  **Base Sepolia**. Mainnet is not in the list unless it was turned on.

### 2. My Offers

- Sidebar group **Demo** lists Overview and Merkado Account.
- Sidebar group **Merkado Direct** lists My Offers, Create Offer, Get Now,
  Marketplace, Portfolio.
- The table is first. Six rows after Reset. Collecting offers such as
  MRA-001 appear before drafts. Advance is cash already paid — drafts and
  unfunded offers are not in the totals as money already advanced.
- Open **MRA-001**. You see the sale-not-loan explainer, a mocked one-time
  settlement reference, and later rent going to holders — not paid again
  to the landlord. **Record collection** and **Approve offer** sit inside
  **Lab controls**. Drafts keep **Submit for review** in the main column.
  Unfunded offers say the landlord **would receive** cash; funded offers
  say **received**.

### 3. Get Now

- Monthly rent (USD) defaults to 1800. Estimated market rent defaults to 3000.
- Property quality 89 and Payment history 95 are sliders with live numbers.
- Combined property view updates from rent vs typical rent. 60% of typical
  rent should look favourable.
- 3 months is disabled. 6 months can use the quote. 9 and 12 simulate only.
- Click **Demonstrate 24% cap**. Use this quote stays off. No quote is saved.

### 4. Use this quote

- From a good 6-month quote, click **Use this quote**.
- Create Offer opens with those non-sensitive values. You can save a draft.

### 5. Marketplace and Portfolio

- Marketplace cards look like merkado.cw listing cards. They still show
  combined property view, payment history, term, and amount filled. Amount filled is
  holder contribution (MRA-001: $10,500). The landlord purchase price is
  lower ($10,206). No tenant name, employer, or street. The whole card
  opens the offer.
- Subscribe is closed. Open **MRA-001** and use **View position** to
  reach Portfolio.
- Portfolio shows a Position ID and collection / distribution language.
- There is no Claim button and no transfer or sale control.

### 6. Pay rent

- Open Pay from the hub. You see the USDC mark, **1,800.00 USDC**, the
  same $1,800 rent, copy address and amount, and both **I’ve sent this
  payment** and **Connect wallet**.
- **Payment history** is on the same Pay page. There is no second history page.
- Network is **OP Sepolia** after Reset. On Overview you can switch to
  **Base Sepolia**. Mainnet is later and stays off unless turned on.
- Copy the address, then click **I’ve sent this payment**. You should see
  a pending state, then **Rent paid**.
- Reset, then walk Connect wallet → Pay with demo wallet → pending →
  success. Rent and lease stay unchanged.
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

- Back to Overview. **Reset demo** restores the seeded book, payments,
  and distributions. The payment network you selected stays.

### What you are judging

- Would a landlord think this is a loan?
- Would a renter think their lease or rent changed?
- Would a holder think they can buy in today, or that collections are
  guaranteed?
- Is the live demo easy to explain?

If everything looks correct, reply: `Approved, commit and push.`
