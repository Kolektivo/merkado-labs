# 11 - Testing and UAT

**Purpose:** How we verify the Direct / Pay Buildathon demo.
**Last updated:** August 21, 2026 (payout-first, whole-offer flow)

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
6. Offer detail: landlord sees review/listed/sold/paid, automatic payout, and
   60-day availability; no holder or monthly collection detail. Operations
   controls are only in Admin.
7. Marketplace: no tenant name or address; server rejects fractional and expired
   purchases; a mocked **Connect wallet** button gates a 100% purchase.
8. Portfolio: Position ID; collected / ready to claim / claimed;
   per-offer rent address; mocked wallet-gated **Claim rent** after rent arrives.
9. Pay: seeded request **XCG 3,222.00** / **1,800.00 USDC** on the selected
   network (**Base Sepolia** after Reset); QR, copy-address, and **I’ve sent
   this payment** only; collapsed Sentoo preview; visible pending then success;
   invalid id is a safe not-found.
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

This is approval of the local mocked walkthrough only. Do **not** send
test USDC, merge PRs 19 / 20 / 22, or switch the rail to live from this
checklist.

### Before you start

Open **Admin** at the bottom of the left nav. Click **Reset the book** and
confirm **Yes, reset**. After Reset, **MRA-001** is fully purchased and
marked **Paid** automatically. **MRA-010** is created by Merkado and still open
on Marketplace.

### 1. Home

- The page starts with **Rent paid forward**. It does not repeat
  “Merkado Direct” as a small eyebrow above the heading.
- Featured Marketplace cards are visible. Buttons are violet, not black.
- After Reset, the header bell and **My Offers** count show the paid Sun Set
  Heights offer and the listed Punda offer as updates, not amounts the landlord
  must claim. Home does not repeat those cards. **Clear all** hides the updates.
- You do **not** see a long sale-not-loan box, Reset, or legal questions.

### 2. Simulator

- Monthly rent shows **3222.00** XCG. Typical nearby rent shows **5370.00**.
- Property quality 89 and Payment history 95 are sliders with live numbers.
- Click **Small studio**. Rent becomes **1.79**. The cash to the
  landlord is about **XCG 10.17**.
- 3 months is disabled. 6 months can use the quote.

### 3. Create offer and Admin

- From the XCG 10 example, click **Use this quote**.
- Add a cover photo if you want. On **Payout**, choose **Stablecoin address** and
  keep or enter a fictional value beginning with `0xDEMO`. Select **Bank
  account** once to confirm Girasol, Coming soon, the illustrative fee, and
  browser-only fictional fields are clear. Return to Stablecoin. On Review, the
  page should say you do not need a wallet. Click **Submit request**.
- Open **Admin** at the bottom of the left nav. Open the new offer.
  The approver choices should be **Enrique** and **Luuk**. Pick either
  one, then click **Approve offer**.

### 4. Marketplace and Portfolio

- Open **My Offers** first. Offers should appear in a table (compact rows on
  a phone) with a sale amount and one clear **Next** step. **Filter offers**
  and **Book overview** should be collapsed.
- Open **Marketplace**. You see two cards with **XCG** amounts and photos:
  the funded Sun Set Heights house and the open **Punda** studio.
- Open the **Punda** studio (**MRA-010**). The card shows one whole-offer price,
  100% ownership, and a 60-day deadline. There is no amount input, 25%, or 50%.
- Click **Connect wallet**. It shows a fictional connected wallet. Click
  **Purchase whole offer**. A **Purchase recorded** dialog appears on Portfolio.
- Open **My Offers** for Punda. It is **Sold** and its Landlord proceeds card is
  **Paid automatically** to the saved demo destination. There is no landlord
  claim button, transaction hash, or explorer link.

### 5. Pay rent

- Open **Merkado Pay**. You see a list. MRA-001 is **XCG 3,222.00**.
  After purchasing MRA-010, a **XCG 1.79** rent also appears.
- Open the XCG 1.79 payment. Confirm only with **I’ve sent this payment**.
  Settlement note shows **1.00 USDC**. There is no Connect wallet button.
- The expanded **Pay with stablecoin** card shows an informational demo QR plus
  the same copyable offer address and amount. Its text must say it cannot open a
  real wallet. **Continue with Sentoo** stays collapsed underneath. Opening it
  expands fictional bank fields, Coming soon, and a disabled action; the
  stablecoin card collapses. It must not record a payment.
- Copy the address, then click **I’ve sent this payment**. You should see
  a pending state, then **Rent paid**.
- Portfolio for that position now shows the offer rent address and rent ready to
  claim. Click **Connect wallet**, then **Claim rent**. A **Rent claimed**
  dialog shows the amount. Close it. The position should then show the amount as
  claimed.
- Reset, then walk **I’ve sent this payment** → pending → Rent paid. Rent and
  lease stay unchanged.
- A later month (for example November) says to pay the earlier month first.
- You never see a fee, holder name, or distribution figure.
- Refresh the success page. The payment is still there once.

### 6. Account Apps and Pay

- Account looks like merkado.cw account: same logo, top nav, footer,
  breadcrumb, and left nav groups. The profile is **Luuk Weber** with the
  photo avatar. There is no Admin item. **Apps** sits above **Account**.
  Marketplace, Plan & Billing, Account Settings, Cars, Real Estate,
  Create a listing, and Log out look disabled. **Merkado Pay** and
  **Merkado Direct** are clickable. **Payouts** is not in Account. There
  is no My Payments row in Account.
- Open **Merkado Pay**. The same page has this month’s payment and
  **Payment history** underneath. There is no second payments page.
- Direct opens the landlord walkthrough. If no external URL is configured,
  both apps stay inside this demo.
- On a phone, the top menu and left account nav show the same links.
  **Merkado Pay** and **Merkado Direct** are clickable. **Account
  Settings** looks disabled. **Payouts** is not in Account.

### 7. Reset

- Open **Admin**. **Reset the book** restores the two seeded offers
  (**MRA-001** and the cheap Punda studio), payments, and distributions.
  The payment network you selected stays.

### What you are judging

- Would a landlord think this is a loan?
- Would a renter think their lease or rent changed?
- Would a holder think they can buy in today, or that collections are
  guaranteed?
- Is the Labs walkthrough easy to explain without sounding live?

If the local mocked walkthrough looks correct, reply:
`Approved, commit and push.` This does not approve merging Luis’s draft
PRs or switching on real payments.
