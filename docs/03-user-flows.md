# 03 - User Flows

**Purpose:** The journeys the Labs demo must support.
**Last updated:** August 21, 2026 (Direct notifications, no Payouts page)

## 1. Hosted access

On the hosted URL, the first screen is a shared-password door (`/enter`).
It is a Merkado-branded private walkthrough, not a Merkado account. After
the correct password, the visitor continues to the requested page
(Home by default). Local `npm run dev` skips this door unless
`LABS_DEMO_PASSWORD` is set. Hosted production stays locked if that
password is missing.

## 2. Home

Visitor lands on Home (`/`), sees Merkado Direct totals, featured
Marketplace offers, and doors to Simulator, Create offer, Portfolio, and
Pay. If a sale amount or rent is ready to claim, Home, the header
bell, and a count on **My Offers** or **Portfolio** show it and open
the existing offer or Portfolio page. Amounts are
in XCG. Payment network and Reset live in **Admin**. Stage 0 legal
questions stay open in documentation; they are not shown on customer
Home.

## 3. Landlord (Merkado Direct)

1. **My Offers** — the two-offer demo book appears as a table (compact rows on
   a phone). Each row shows the sale amount, status, and one **Next** step.
   Filters and book totals stay available in collapsed sections instead of
   competing with the main journey. **MRA-001** starts fully bought; **MRA-010**
   starts open on Marketplace. Create Offer can still add a draft.
2. **Simulator** — see the cash a landlord would get now, in XCG. Defaults
   match MRA-001 (XCG 3,222 rent, XCG 5,370 typical nearby rent, property
   quality 89, payment history 95, 6 months). Connected-landlord is
   hidden. 3 months disabled. 9/12 are simulation-only. **Small studio**
   loads the XCG 1.79 monthly rent / about XCG 10 purchase quote.
3. **Use this quote** — eligible six-month quotes under the 24% cap carry
   non-sensitive values into Create Offer.
4. **Create Offer** — six steps including a cover photo, then **Submit
   request**. No wallet is needed. 9/12 and cap-breached quotes cannot be
   submitted.
5. Offer detail — after approval Merkado creates **one offer for this
   listing**. Every non-draft offer shows one **Landlord proceeds** card
   (Waiting, Available, or Paid on `main`; Processing and Failed also
   exist on Luis PR #22). After a holder buys it, the landlord **claims**
   sale proceeds to a pasted, unverified demo address. That address
   locks. A success dialog confirms the claimed amount. Later rent is not paid
   to the landlord again. Independent
   approval, Record collection, and dual-control live in **Admin**.
6. **Landlord proceeds** — use the property name (Sun Set Heights, Punda
   studio) as the main label. MRA numbers stay secondary. Fully purchased
   offers show **Ready to claim**; technical mock-funding detail is in a
   tooltip. The available amount is the hero. The fee is informational and
   already included. Paid is final:
   no retry, edit, transaction hash, or explorer link. Disclosure:
   “No wallet ownership was verified and no on-chain transfer was sent.”

## 4. Holder (Merkado Direct)

1. Marketplace shows anonymised cards in merkado-cw listing-card chrome:
   photo, district, beds, type, combined property view, payment history,
   term, and amount filled. A holder can buy any portion still open. The
   cheap Punda studio (MRA-010) is the small walkthrough purchase.
   A successful purchase opens a confirmation dialog on the new Portfolio
   position so the buyer knows the action was recorded.
2. Offer detail stays privacy-walled. No tenant name, employer, income,
   contact, or street address. A funded offer links to its Portfolio
   position.
3. Portfolio shows pre-seeded positions with a stable Position ID,
   collected / ready-to-claim / claimed amounts, and mocked
   transaction references. When rent arrives, the holder **Claims** it
   from that listing. A success dialog confirms the rent amount claimed.
   There is no secondary sale UI yet; one listing
   offer exists so a later resale can be added.

## 5. Renter (Merkado Pay)

1. `/pay` opens the seeded current payment request. `/pay/[id]` is the
   canonical deep link. Invalid IDs show a friendly not-found. A later
   month cannot be paid while an earlier month on the same deal is still
   open — the page sends the renter back to the next payment.
2. Due state: period, primary USDC amount (1:1 with USD rent), due date,
   unique reference, fictional receiving address, selected payment
   network (**Base Sepolia**).
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
   Admin is hidden. Apps has its own sidebar group, above Account. Merkado
   Pay and Merkado Direct are clickable. Account Settings stays visible
   but inactive. Payouts is not shown here.
2. Apps lists Merkado Pay and Merkado Direct. Internal Labs routes are
   used unless an external URL is configured. Merkado Pay opens the
   payment link. Payment history sits on that same Pay page.
3. Landlord sale claims stay on My Offers / the offer page. The Direct
   header bell and Home list ready-to-claim items and open those same
   pages. Old `/account/payouts` and `/payouts` redirect to My Offers.
   Old `/account/settings` and `/account/payments` redirect into Account
   Apps or Pay.

## 7. Admin approval

Submitted offers are approved in **Admin**. The approver selector contains the
two walkthrough options **Enrique** and **Luuk**. Approval remains independent
from the person who submitted the request.

## 8. Shared payment

One confirmed mock payment updates exactly once: the payment request,
the matching receivable, one collection, and holder distribution
activity. Refresh and retry are idempotent. Initiated / pending /
confirmed stay distinct in the data model.

## 9. Privacy walls

- Payer never sees economics.
- Purchaser never sees payer identity, employer, address, or exact income.
- Purchaser never contacts the payer.
- Payer never sees the purchaser.
- Landlord never sees holder wallet details.
