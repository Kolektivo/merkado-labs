# 03 - User Flows

**Purpose:** The journeys the Labs demo must support.
**Last updated:** August 21, 2026 (Base Sepolia transferable NFT rent offer)

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
Pay. Offer decisions and holder rent actions
appear in the header bell and as a count on **My Offers** or
**Portfolio**. Each update opens the existing offer or Portfolio page. Amounts are
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
4. **Create Offer** — seven steps including a cover photo and **Payout**, then
   **Submit request**. The landlord chooses the payout destination before
   submission. No landlord wallet is needed. 9/12 and cap-breached quotes
   cannot be submitted.
5. Offer detail — after approval Merkado mints **one offer NFT for this
   listing** from the company Safe. Every purchased offer shows one
   **Landlord proceeds** card (Waiting, Processing, or Paid). When a buyer
   purchases the whole offer, the buyer pays the exact purchase price
   **directly to the locked landlord payout address** and the NFT moves
   company Safe → buyer atomically. There is no landlord claim action, no
   funding record, and no listing expiry. Later rent is not paid to the
   landlord again. Independent approval, Record collection, and
   dual-control live in **Admin**.
6. **Landlord proceeds** — use the property name (Sun Set Heights, Punda
   studio) as the main label. MRA numbers stay secondary. Purchased offers
   show **Paid** when the sale completes; the purchase price is the hero.
   The fee is informational and already included. Paid is final.
   Disclosure: the buyer pays the exact purchase price directly to the
   locked landlord payout address; there is no landlord claim step.
7. Landlord-facing lifecycle is **Under review → Listed → Sold → Paid**, with
   **Denied** as an explicit outcome. There is no 60-day expiry. Monthly
   collections and holder detail stay out of the landlord view.

## 4. Holder (Merkado Direct)

1. Marketplace shows anonymised cards in merkado-cw listing-card chrome:
   photo, district, beds, type, combined property view, payment history,
   term, and whole-offer price. A holder connects a real wallet (injected
   EIP-1193, e.g. WalletConnect/Privy) and buys 100% of the offer. The
   buyer pays the exact purchase price **directly to the locked landlord
   payout address**; the NFT moves company Safe → buyer atomically in the
   same transaction. The cheap Punda studio (MRA-010) is the small
   walkthrough purchase. A successful purchase opens a confirmation dialog
   on the new Portfolio position.
2. Offer detail stays privacy-walled. No tenant name, employer, income,
   contact, or street address. A purchased offer links to its Portfolio
   position.
3. Portfolio shows pre-seeded positions with a stable Position ID, the
   offer token id, accrued rent per token, and the current owner. The
   **current NFT owner** calls **Claim rent** (`claimRent(tokenId)`) to
   withdraw the token's accrued USDC. Because the NFT is transferable, a
   holder can send the token to another wallet (or another wallet can
   receive it) and that new owner becomes the holder and can claim. There
   is no fractional purchase and no secondary sale UI beyond the transferable
   token itself.

## 5. Renter (Merkado Pay)

1. `/pay` opens the seeded current payment request. `/pay/[id]` is the
   canonical deep link. Invalid IDs show a friendly not-found. A later
   month cannot be paid while an earlier month on the same deal is still
   open — the page sends the renter back to the next payment.
2. Due state: period, primary USDC amount (1:1 with USD rent), due date,
   unique reference, opaque payment id, selected payment
   network (**Base Sepolia**). A status badge and the pay action sit with
   the amount so they stay visible on a phone.
3. The renter deposits rent by calling `depositRent(tokenId,
   opaquePaymentId, amount)` through the `MerkadoRentOfferV1` contract.
   The amount must equal the exact monthly rent and an offer accepts at
   most **6 installments**. The deposit is pending → confirmed on chain.
   Already paid and overdue remain.
4. Notice that rent and lease are unchanged. Pay is English-only.
5. No fee, purchase price, holder identity, or distribution economics.

## 6. Merkado account (Labs mock)

1. `/account` opens Apps (or redirects there) inside merkado-cw account
   chrome. Other account and marketplace links are visibly disabled.
   Admin is hidden. Apps has its own sidebar group, above Account. Merkado
   Pay and Merkado Direct are clickable.
2. Apps lists Merkado Pay and Merkado Direct. Internal Labs routes are
   used unless an external URL is configured. Merkado Pay opens the
   payment link. Payment history sits on that same Pay page.
3. Old `/account/payouts` and `/payouts` redirect to My Offers.
   Old `/account/settings` and `/account/payments` redirect into Account
   Apps or Pay.

## 7. Admin approval

Submitted offers are approved in **Admin**. The approver selector contains the
two walkthrough options **Enrique** and **Luuk**. Approval remains independent
from the person who submitted the request. After approval, the server mints
the offer NFT from the company Safe (requires the contract to be deployed and
the env address set).

## 8. Shared payment

One confirmed `depositRent` updates exactly once: the payment request,
the matching receivable, one collection, and the holder's claimable rent.
Refresh and retry are idempotent. Initiated / pending /
confirmed stay distinct in the data model. Chain events are recorded in the
chain store tables.

## 9. Privacy walls

- Wallet addresses and payout amounts are **public on-chain** once the
  contract is active. Tenant and property identity stay off-chain.
- Payer never sees economics.
- Purchaser never sees payer identity, employer, address, or exact income.
- Purchaser never contacts the payer.
- Payer never sees the purchaser.
- Landlord never sees holder wallet details beyond the public token owner.
