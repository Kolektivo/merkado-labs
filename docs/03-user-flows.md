# 03 - User Flows

**Purpose:** The journeys the Labs demo must support.
**Last updated:** August 19, 2026 (Pay rail-mode note)

## 1. Hosted access

On the hosted URL, the first screen is a shared-password door (`/enter`).
It is a Merkado-branded private walkthrough, not a Merkado account. After
the correct password, the visitor continues to the requested page
(Overview by default). Local `npm run dev` skips this door unless
`LABS_DEMO_PASSWORD` is set. Hosted production stays locked if that
password is missing.

## 2. Demo hub

Visitor lands on Overview (`/`), sees entry points to **Merkado Direct**,
**Merkado Pay**, and the **Merkado account** mock, plus MRA-001 figures,
open legal questions, a **Payment network** control (OP Sepolia / Base
Sepolia now; mainnet later), and **Reset demo**.

## 3. Landlord (Merkado Direct)

1. **My Offers** — the six-offer book. Totals count only funded, non-draft
   offers as money already advanced or receivables already sold.
2. **Get Now** — see the cash a landlord would get now. Defaults match
   MRA-001 ($1,800 rent, $3,000 typical nearby rent, property quality 89,
   payment history 95, connected landlord on, 6 months). 3 months
   disabled. 9/12 are simulation-only.
3. **Use this quote** — eligible six-month quotes under the 24% cap carry
   non-sensitive values into Create Offer.
4. **Create Offer** — six steps, then save as draft. 9/12 and cap-breached
   quotes cannot be saved. A draft can be submitted for independent
   approval.
5. Offer detail — sale-not-loan, Listing Score / Property Score, one-time
   mocked upfront settlement reference, and collection / automatic
   distribution status. Later rent is not paid to the landlord again. No
   holder wallet details. Drafts keep **Submit for review**. Independent
   approval, Record collection, and dual-control stay in Lab controls.

## 4. Holder (Merkado Direct)

1. Marketplace shows anonymised cards in merkado-cw listing-card chrome:
   photo, district, beds, type, combined property view, payment history,
   term, and amount filled. Subscribe is closed.
2. Offer detail stays privacy-walled. No tenant name, employer, income,
   contact, or street address. A funded offer links to its Portfolio
   position.
3. Portfolio shows pre-seeded positions with a stable Position ID,
   collected / awaiting distribution / distributed amounts, and mocked
   transaction references. Distributions are automatic. There is no Claim
   button and no transfer or sale UI.

## 5. Renter (Merkado Pay)

1. `/pay` opens the seeded current payment request. `/pay/[id]` is the
   canonical deep link. Invalid IDs show a friendly not-found. A later
   month cannot be paid while an earlier month on the same deal is still
   open — the page sends the renter back to the next payment.
2. Due state: period, primary USDC amount (1:1 with USD rent), due date,
   unique reference, fictional receiving address, selected payment
   network (**OP Sepolia** by default; Base Sepolia also available).
   A status badge and both payment paths sit with the amount so they stay
   visible on a phone.
3. Two payment paths (mocked until `PAYMENT_RAIL_MODE` is `"live"`):
   - copy the address and amount, then **I’ve sent this payment**;
   - connect a demo wallet and pay here.
   Both paths show pending → confirmed / success, plus failure and
   incorrect-amount outcomes. Already paid and overdue remain.
4. Notice that rent and lease are unchanged. Pay is English-only.
5. No fee, purchase price, holder identity, or distribution economics.

## 6. Merkado account (Labs mock)

1. `/account` opens Apps (or redirects there) inside merkado-cw account
   chrome. Other account and marketplace links are visibly disabled.
   Admin is hidden. Apps has its own sidebar group, above Account. Only Merkado Pay and
   Merkado Direct are clickable, each with an external-link icon.
2. Apps lists Merkado Pay and Merkado Direct. Internal Labs routes are
   used unless an external URL is configured. Merkado Pay opens the
   payment link. Payment history sits on that same Pay page.
3. Old `/account/payments` and `/pay/payments` redirect into Pay.

## 7. Shared payment

One confirmed mock payment updates exactly once: the payment request,
the matching receivable, one collection, and holder distribution
activity. Refresh and retry are idempotent. Initiated / pending /
confirmed stay distinct in the data model.

## 8. Privacy walls

- Payer never sees economics.
- Purchaser never sees payer identity, employer, address, or exact income.
- Purchaser never contacts the payer.
- Payer never sees the purchaser.
- Landlord never sees holder wallet details.
