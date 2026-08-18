# 11 - Testing and UAT

**Purpose:** How we verify the Direct / Pay Buildathon demo.
**Last updated:** August 18, 2026

## Automated

From the repository root:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

Pricing unit tests must reproduce MRA-001 locked figures and the 24% block.
Property Score tests must cover band boundaries, clamping, invalid market
rent, the 0.60 → 1.10 example, and proof that derived Property Score does
not change quote pricing. Payment tests must prove one confirmation cannot
duplicate collection or distribution.

## Critical flows (engineering)

1. Overview shows Direct, Pay, and Account doors. No login. Reset is here.
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
9. Pay: seeded request ≈ 1,005.59 USDC and Cg 1,800; mock wallet path;
   invalid id is a safe not-found.
10. One confirmed payment appears once in Pay history, My Payments, offer
    collections, and holder distribution. Refresh does not duplicate.
11. Apps cards have working internal fallbacks and accessible new-tab
    behaviour only for absolute URLs.
12. Sale explainer never uses interest rate, debt, or borrow — only
    “not a loan.”

## Product Lead walkthrough

Do this on http://localhost:3000 after `npm run dev`. There is no login.
Judge copy, clarity, and whether a landlord or tenant would misunderstand
this as a loan. After each item, reply with what you saw if it felt wrong.

### Before you start

Click **Reset demo** on Overview and confirm **Yes, reset**.

### 1. Overview

- You see doors into Merkado Direct, Merkado Pay, and the demo account.
- The page does **not** prominently brand a separate Rent Advance product.
- MRA-001 still shows Cg 1,800 rent, six months, Cg 10,206 cash, 5.50%
  fee, ~21.6%.
- “Still open” lists the legal questions in plain language.

### 2. My Offers

- Sidebar group **Merkado Direct** lists My Offers, Create Offer, Get Now,
  Marketplace, Portfolio.
- The table is first. Six rows after Reset. Collecting offers such as
  MRA-001 appear before drafts. Advance is cash already paid — drafts and
  unfunded offers are not in the totals as money already advanced.
- Open **MRA-001**. You see the sale-not-loan explainer, a mocked one-time
  settlement reference, and later rent going to holders — not paid again
  to the landlord.

### 3. Get Now

- Monthly rent defaults to 1800. Estimated market rent defaults to 3000.
- Listing Score 89 and Payer Score 95 are sliders with live numbers.
- Property Score updates from rent-to-market. Ratio 0.60 should look
  favourable.
- 3 months is disabled. 6 months can use the quote. 9 and 12 simulate only.
- Click **Demonstrate 24% cap**. Use this quote stays off. No quote is saved.

### 4. Use this quote

- From a good 6-month quote, click **Use this quote**.
- Create Offer opens with those non-sensitive values. You can save a draft.

### 5. Marketplace and Portfolio

- Marketplace cards show Property Score. No tenant name, employer, or street.
- Subscribe is closed.
- Portfolio shows a Position ID and collection / distribution language.
- There is no Claim button.

### 6. Pay rent

- Open Pay from the hub. You see about **1,005.59 USDC** and Cg 1,800.
- Network is “to be confirmed” unless a demo network is set. It is not Base
  by default.
- Walk connect → pending → success. Rent and lease stay unchanged.
- A later month (for example November) says to pay the earlier month first.
- Switch English / Nederlands / Papiamentu.
- You never see a fee, holder name, or distribution figure.
- Refresh the success page. The payment is still there once.

### 7. My Payments and Apps

- Account → My Payments shows the same payment facts and a Pay rent link.
- Apps cards open Pay and Direct. If no external URL is configured, they
  stay inside this demo.

### 8. Reset

- Back to Overview. **Reset demo** restores the seeded book, payments,
  and distributions.

### What you are judging

- Would a landlord think this is a loan?
- Would a renter think their lease or rent changed?
- Would a holder think they can buy in today, or that collections are
  guaranteed?
- Is the live demo easy to explain?

If everything looks correct, reply: `Approved, commit and push.`
