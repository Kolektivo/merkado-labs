# 11 - Testing and UAT

**Purpose:** How we verify the Rent Advance demo.
**Last updated:** August 14, 2026

## Automated

From the repository root:

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

Pricing unit tests must reproduce MRA-001 locked figures and the 24% block.

## Critical flows (engineering)

1. Overview shows MRA-001 figures and three role doors. No login.
2. Offers lists six offers; MRA-001 is Live.
3. Get Now: cash figure first; 3-month disabled; Demonstrate 24% cap blocks the quote.
4. Offer detail: collections only on live deals; dual control fails if the same person is chosen twice. Approval on MRA-004 is one click.
5. Marketplace: no tenant name or address; Subscribe is closed.
6. Pay rent: one page; headline says rent is unchanged; Cg 1,800.00 to the
   property manager; notice in English / Nederlands / Papiamentu.
7. Overview Reset demo asks to confirm, then restores the seed book.
8. Sale explainer never uses interest rate, debt, or borrow — only “not a loan.”

## Product Lead walkthrough

Do this on http://localhost:3000 after `npm run dev`. There is no login.
Judge copy, clarity, and whether a landlord or tenant would misunderstand
this as a loan. After each item, reply with what you saw if it felt wrong.

### Before you start

Click **Reset demo** on Overview and confirm **Yes, reset** so you start from
the six seeded offers.

### 1. Overview

- You see three doors: landlord, holder, renter.
- Buttons read **Open landlord book**, **Open marketplace**, **Pay rent**.
- MRA-001 shows Cg 1,800 rent, six months, Cg 10,206 cash, 5.50% fee, ~21.6%.
- “Still open” lists three legal questions in plain language.
- The page says this is a sale of receivables, not a loan.

### 2. Landlord book (Offers)

- The table is first. Six rows: Live, Funding, Closed, Under review, Default, Draft.
- **Needs attention** is collapsed unless something needs you.
- Open **MRA-001**. You see the sale-not-loan explainer and a **Collections** tab.
- Related-party note is on MRA-001 (family of a board member), not on MRA-004.

### 3. Approve a waiting offer

- Open **MRA-004**. Approver is already R. Girigoria.
- Click approve. Status becomes Funding.

### 4. Two-person release (MRA-001)

- On MRA-001, pick the **same person twice** → it must refuse.
- Then instruct as D. Martina and sign as A. Sambo → it must succeed.

### 5. Record a collection (MRA-001)

- Record month 1. The book updates. You can undo with Reset demo later.

### 6. Create offer

- **Create offer** in the sidebar. Six steps, already filled from MRA-001.
- You can jump to **Quote** or **Review**.
- Save as draft. A new row (MRA-007) appears. Reset will remove it.

### 7. Get Now

- Open **Get Now**. Choose the **six-month** term.
- Cash figure is first. 3 / 9 / 12 month buttons stay disabled.
- Click **Demonstrate 24% cap**. No quote is created.

### 8. Holder marketplace

- Open **Marketplace**. You do **not** see a tenant name, employer, or street.
- Drafts and under-review offers are hidden.
- **Subscribe** is closed and does not complete a purchase.

### 9. Portfolio

- **Portfolio** shows book-entry amounts in XCG, not a promised return.

### 10. Pay rent

- Headline: **Your rent is unchanged.**
- Next payment: **Cg 1,800.00** to the property manager, reference MRA-001.
- Switch **English / Nederlands / Papiamentu**. The notice changes.
- You never see a fee, holder name, or return figure.
- Confirm the payment. The page updates.

### 11. Reset

- Back to Overview. **Reset demo** asks “Restore the six seeded offers?”
- After **Yes, reset**, MRA-007 is gone and MRA-004 is Under review again.

### What you are judging

- Would a landlord think this is a loan?
- Would a renter think their lease or rent changed?
- Would a holder think they can buy in today, or that collections are guaranteed?

If everything looks correct, reply: `Approved, commit and push.`
