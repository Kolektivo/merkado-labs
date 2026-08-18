# 03 - User Flows

**Purpose:** The journeys the Labs demo must support.
**Last updated:** August 18, 2026

## 1. Demo hub

Visitor lands on Overview (`/`), sees entry points to **Merkado Direct**,
**Merkado Pay**, and the **Merkado account** mock, plus MRA-001 figures,
open legal questions, and **Reset demo**.

## 2. Landlord (Merkado Direct)

1. **My Offers** — the six-offer book. Totals count only funded, non-draft
   offers as money already advanced or receivables already sold.
2. **Get Now** — simulate rent paid forward. Defaults match MRA-001
   (Cg 1,800 rent, Cg 3,000 market rent, Listing Score 89, Payer Score 95,
   related party on, 6 months). 3 months disabled. 9/12 are simulation-only.
3. **Use this quote** — eligible six-month quotes under the 24% cap carry
   non-sensitive values into Create Offer.
4. **Create Offer** — six steps, then save as draft. 9/12 and cap-breached
   quotes cannot be saved.
5. Offer detail — sale-not-loan, Listing Score / Property Score, one-time
   mocked upfront settlement reference, collections, dual-control release.
   Later rent is not paid to the landlord again. No holder wallet details.

## 3. Holder (Merkado Direct)

1. Marketplace shows anonymised cards with a property photo, district,
   **Property Score**, payer band, and term. Subscribe is closed.
2. Offer detail stays privacy-walled. No tenant name, employer, income,
   contact, or street address.
3. Portfolio shows pre-seeded positions with a stable Position ID,
   collected / pending distribution / distributed amounts, and mocked
   transaction references. Distributions are automatic. There is no Claim
   button.

## 4. Renter (Merkado Pay)

1. `/pay` opens the seeded current payment request. `/pay/[id]` is the
   canonical deep link. Invalid IDs show a friendly not-found. A later
   month cannot be paid while an earlier month on the same deal is still
   open — the page sends the renter back to the next payment.
2. Due state: period, primary USDC amount, supporting XCG, due date,
   unique reference, fictional receiving address, data-driven network
   label (or “Network to be confirmed”). The amount and Connect wallet
   sit above the unchanged-lease list so they stay visible on a phone.
3. Mock wallet: disconnected → connecting → connected → awaiting
   confirmation → pending → confirmed, plus failure, partial amount,
   already paid, and overdue.
4. Notice that rent and lease are unchanged. English / Nederlands /
   Papiamentu.
5. No fee, purchase price, holder identity, or distribution economics.

## 5. Merkado account (Labs mock)

1. `/account` opens My Payments (or redirects there).
2. My Payments shows the next USDC amount, XCG rent, due date, status,
   and a Pay rent CTA into the matching Pay deep link.
3. Apps lists Merkado Pay and Merkado Direct. Internal Labs routes are
   used unless an external URL is configured.

## 6. Shared payment

One confirmed mock payment updates exactly once: the payment request,
the matching receivable, one collection, and holder distribution
activity. Refresh and retry are idempotent. Initiated / pending /
confirmed stay distinct in the data model.

## 7. Privacy walls

- Payer never sees economics.
- Purchaser never sees payer identity, employer, address, or exact income.
- Purchaser never contacts the payer.
- Payer never sees the purchaser.
- Landlord never sees holder wallet details.
