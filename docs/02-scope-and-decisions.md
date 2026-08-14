# 02 - Scope and Decisions

**Purpose:** Current Labs MVP scope, resolved decisions, and open gates.
**Last updated:** August 14, 2026

## 1. MVP goal

Ship a working **Merkado Rent Advance / Merkado Direct** demo in this repository, seeded from **MRA-001**, using the existing Labs dashboard design system and Labs Supabase only.

Property scrapers, Browse, enrichment, and pipeline work are **out of this repo**. They live on merkado-cw.

## 2. In scope

| Priority | Deliverable | Completion test |
|---|---|---|
| P0 | Pricing engine | Reproduces MRA-001 cents and IRR; blocks >24% with no override |
| P0 | Originate book | Six demo offers with statuses, Passport, collections, dual control |
| P0 | Landlord disclosure | Net advance, gross forgone, flat fee, effective rate, sale-not-loan, no other charge, non-recourse |
| P0 | Payer journey | XCG rent, what does not change, EN/NL/Papiamentu notice |
| P0 | Purchaser journey | Anonymised cards; subscribe gated by M.1.2 / M.1.4 |
| P1 | Open gates | Stage 0 questions visible on Overview |
| P1 | Labs schema | RLS on; service-role only; no production project |

## 3. Out of scope

- Public Merkado Direct marketing page
- Third-party subscription
- Secondary transfer
- 3-month term pricing
- On-chain / USDC / wallets / tokens as the product
- Property series (enum reserved, not built)
- Scrapers, Terra, What Fits Me, public listing browse
- Deploy to Vercel unless the Product Lead asks

## 4. Resolved decisions

| Topic | Decision |
|---|---|
| Landlord name | Merkado Rent Advance |
| Holder platform | Merkado Direct · series Rent Advance |
| Instrument | Digital Participation Right (book-entry in this demo) |
| Commercial form | True sale of receivables (*koop en cessie*) |
| Currency | XCG cents; USD display-only at 1.79 |
| Approved term | 6 months only |
| Fee model | Single % of gross receivables; no flat fees |
| Related-party | Explicit +25 bp; independent approver; never cheaper than market |
| Cap | 24% effective annualised, engine-enforced |
| Crypto | Not in this demo |
| Production marketplace | merkado-cw only |
| Supabase | Labs `csaefdkpwukshtouyixg` only |

## 5. Open questions (must stay visible)

| ID | Question | Blocks |
|---|---|---|
| M.1.2 | DPR characterisation | All third-party holder activity |
| M.1.3 | Stichting object and board | All collection flow |
| M.1.4 | Investor-funds licensing | Public Merkado Direct |
| M.2.1 | Assignment of future rent claims | Document template sign-off |
| M.3.1 | Related-party arm’s-length file | Nothing if +25 bp is kept |

## 6. Vocabulary

Use: sale, purchase price, receivables, assignment, collections, discount, fee, advance, participation, holder, distribution.

Never use in product copy or schema names: loan, borrow, lend, interest rate, repayment, principal, debt, yield, guaranteed, fund (as product).
