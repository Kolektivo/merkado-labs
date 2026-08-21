# 03 - User Flows

**Purpose:** The journeys the Labs demo must support.
**Last updated:** August 20, 2026 (Base Sepolia / Base Mainnet)

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
Pay. Amounts are in XCG. Payment network and Reset live in **Admin**.
Stage 0 legal questions stay open in documentation; they are not shown
on customer Home.

## 3. Landlord (Merkado Direct)

1. **My Offers** — the two-offer demo book (**MRA-001** funded live, **MRA-010**
   open on Marketplace). Totals count only funded, non-draft offers as money
   already advanced or receivables already sold. Create Offer can still add a
   draft.
2. **Simulator** — see the cash a landlord would get now, in XCG. Defaults
   match MRA-001 (XCG 3,222 rent, XCG 5,370 typical nearby rent, property
   quality 89, payment history 95, 6 months). Connected-landlord is
   hidden. 3 months disabled. 9/12 are simulation-only. **Small studio**
   loads the XCG 1.79 monthly rent / about XCG 10 purchase quote.
3. **Use this quote** — eligible six-month quotes under the 24% cap carry
   non-sensitive values into Create Offer.
4. **Create Offer** — six steps including a cover photo, then **Submit for
   review**. 9/12 and cap-breached quotes cannot be submitted.
5. Offer detail — cash figures, one-time mocked upfront settlement, and
   collection / automatic distribution status. Later rent is not paid to
   the landlord again. Drafts keep **Submit for review**. Independent
   approval, Record collection, and dual-control live in **Admin**.
6. **Landlord proceeds claim** (PR #21) — on a fully-funded claim-mode
   offer (`landlord_claim`), the offer detail shows a **Landlord proceeds**
   card. The claim starts in `available`: the landlord enters an
   **unverified demo payout address** and clicks **Claim proceeds**. The
   claim moves to `processing` and locks that destination. From there the
   landlord can **Mark as paid** (terminal — records a mocked
   `landlord_proceeds_claim` ledger row, never a duplicate) or **Mark as
   failed**. A failed claim can only **Retry claim** to the same locked
   destination; a different address is rejected once processing has begun.
   The mock disclosure reads **“Mock demo — no wallet ownership was
   verified and no on-chain transfer was sent.”** No explorer link, no
   token, and `txHash` stays `null`. MRA-001 stays automatic and shows no
   claim. This is a mock, and the shared host password is **not** landlord
   authentication.

## 4. Holder (Merkado Direct)

1. Marketplace shows anonymised cards in merkado-cw listing-card chrome:
   photo, district, beds, type, combined property view, payment history,
   term, and amount filled. A holder can buy any portion still open. The
   cheap Punda studio (MRA-010) is the small walkthrough purchase.
   Filling a claim-mode offering records the **mock funding recorded**
   allocation and makes the landlord proceeds claim `available`.
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
- The landlord claim destination EOA is server-only. It never crosses into
  the payer, purchaser, or portfolio surfaces.
