# 03 - User Flows

**Purpose:** The journeys the Labs demo must support.
**Last updated:** September 1, 2026 (authenticated Labs accounts, linked wallet, ADMIN_EMAILS admin, account-owned books)

## 1. Hosted access

On the hosted URL, the first screen is a sign-in door (`/enter`) that is a
Merkado-branded private walkthrough, not a Merkado account and not live on
merkado.cw. **Supabase Auth** is the primary identity: **Email me a sign-in
link**. The legacy **host password**
  (`LABS_DEMO_PASSWORD`) remains as a deployment gate before sign-in. Hosted
  users must pass the gate and authenticate; hosted production fails closed at
  `/enter`. Local `npm run dev` skips the deployment gate unless
  `LABS_DEMO_PASSWORD` is set.

## 2. Home

Visitor lands on Home (`/`), sees Merkado Direct totals, featured
Marketplace offers, and doors to Simulator, Create offer, Portfolio, and
Pay. Offer decisions and holder rent actions
appear in the header bell and as a count on **My Offers** or
**Portfolio**. Each update opens the existing offer or Portfolio page. Amounts are
in XCG. Payment network and Reset live in **Admin**. Stage 0 legal
questions stay open in documentation; they are not shown on customer
Home. **Reset the book** seeds a fresh demo book (canonical offers as
`funding`, empty on-chain state) and starts a **new chain-store epoch**; it
does **not** roll back the chain — the env contract address stays active so
approved offers mint again on the same deployment.

## 3. Landlord (Merkado Direct)

1. **My Offers** — the signed-in account's demo book appears as a table
   (compact rows on
   a phone). Each row shows the sale amount, status, and one **Next** step.
   Next steps are **Listed for 60 days** for a listed offer and **Sale amount
   paid automatically** once sold. Listed offers also carry the
   display-only **"Available until [date] · 60-day listing window"** text.
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
4. **Create Offer** — seven steps including a cover photo, the designated rent
   payer wallet, and **Payout**, then **Submit request**. The landlord chooses
   the payout destination and rent payer wallet before submission. No landlord
   wallet is needed. An explicit **Save draft** button
   persists the in-progress wizard (e.g. MRA-011) into **My Offers → Draft**;
   drafts are landlord-only and have no chain or payment state. 9/12 and
   cap-breached quotes cannot be submitted.
5. Offer detail — after Admin approval the offer is **Listed** (the backend
   mints one offer NFT from the backend mint key — an Admin/ops detail, never
   shown to the landlord). Every purchased offer shows one
   **Landlord proceeds** card (Waiting, Processing, or Paid). Processing means
   the purchase was submitted but not yet verified; Paid appears automatically
   when the sale completes. When a buyer
   purchases the whole offer, the buyer pays the exact purchase price
   **directly to the locked landlord payout address** and the offer transfers
   to the buyer automatically. There is no landlord claim action and no
   funding record. The **"Available until [date] · 60-day listing window"**
   text is display-only and never enforced. Later rent is not paid to the
   landlord again. Independent approval, Record collection, and
   dual-control live in **Admin**.
6. **Landlord proceeds** — use the property name (Sun Set Heights, Punda
   studio) as the main label. MRA numbers stay secondary. The card moves
   **Waiting → Processing → Paid** automatically: Processing means the
   purchase was submitted but not yet verified, and Paid appears when the
   sale completes; the purchase price is the hero.
   The fee is informational and already included. Paid is final.
   Disclosure: the buyer pays the exact purchase price directly to the
   locked landlord payout address; there is no landlord claim step.
7. Landlord-facing lifecycle is **Under review → Listed → Sold → Paid**, with
   **Denied / Expired / Closed** as explicit outcomes. There is no
   expired-after-60-days state: the 60-day window is display-only and the
   offer stays purchasable until sold. Monthly
   collections and holder detail stay out of the landlord view.

## 4. Holder (Merkado Direct)

1. Marketplace shows anonymised cards from the signed-in account's own book
   in merkado-cw listing-card chrome:
   photo, district, beds, type, combined property view, payment history,
   term, whole-offer price, and the display-only
   **"Available until [date] · 60-day listing window"** text (never
   enforced). A holder signs in, connects a real wallet (injected
   EIP-1193, e.g. WalletConnect/Privy) and **links it** to the account by
   signing a one-time, account/domain/chain/nonce-bound challenge — then
   buys 100% of the offer. The
   buyer pays the exact purchase price **directly to the locked landlord
   payout address**; the NFT moves minter → buyer atomically in the
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

1. `/pay` opens the signed-in account's current payment request. `/pay/[id]`
   is the
   canonical deep link. Invalid IDs — and IDs that belong to another
   account's book — show a friendly not-found that leaks nothing. A later
   month cannot be paid while an earlier month on the same deal is still
   open — the page sends the renter back to the next payment.
2. Due state: period, primary USDC amount (1:1 with USD rent), due date,
   unique reference, opaque payment id, selected payment
   network (**Base Sepolia**). A status badge and the pay action sit with
   the amount so they stay visible on a phone. The payment card has an
   expanded **Pay with stablecoin** panel: the QR, **copy address**, and
   **copy amount** controls are **informational only** (receiving address,
   USDC amount, payment reference for display) and never submit a payment.
   The live actions — **Connect** then a single **Pay rent** action — sit
    inside that same stablecoin section. **Pay rent** opens one dialog that
    runs Approve USDC → waits for the successful approval receipt →
    `depositRent` → server verification, with a **Check status** action for a
    pending transaction (never a blind re-send).
    **Continue with Sentoo** returns as a collapsed panel with a **Coming
    soon** badge.
3. The renter deposits rent by calling `depositRent(tokenId,
   opaquePaymentId, amount)` through the `MerkadoRentOfferV1` contract.
   The amount must equal the exact monthly rent. The deposit is pending →
   confirmed on chain. Already paid and overdue remain. The wallet **Pay
   rent** action is the **only valid payment path**; the renter never sees
   NFT / mint / contract / token / on-chain wording.
4. Notice that rent and lease are unchanged. Pay is English-only.
5. No fee, purchase price, holder identity, or distribution economics.

## 6. Merkado account (Labs demo auth)

1. `/account` opens Apps (or redirects there) inside merkado-cw account
   chrome. Other account and marketplace links are visibly disabled.
   Admin is hidden. Apps has its own sidebar group, above Account. Merkado
   Pay and Merkado Direct are clickable. The shell profile comes from the
   signed-in account email with **Luuk Weber** as the demo
   fallback.
2. Apps lists Merkado Pay and Merkado Direct. Internal Labs routes are
   used unless an external URL is configured. Merkado Pay opens the
   payment link. Payment history sits on that same Pay page. The Apps
   **Wallet** panel links one wallet to the account (Connect then Link
   via the signed challenge) or unlinks it.
3. Old `/account/payouts` and `/payouts` redirect to My Offers.
   Old `/account/settings` and `/account/payments` redirect into Account
   Apps or Pay.
4. The Direct header user menu shows the signed-in profile and **Sign
   out**, which disconnects the wallet and ends the Supabase session.

## 7. Admin approval

**Admin** is an operations page at the bottom of the left nav, shown only
for emails on the server-side `ADMIN_EMAILS` allowlist and enforced on every
Admin server action (fail closed when the allowlist is set). Submitted
offers are approved there. The approver selector contains the
two walkthrough options **Enrique** and **Luuk**. Approval remains independent
from the person who submitted the request. After approval, operators execute
the prepared `mintOffer` calldata from the backend mint key, and the server
verifies the mint receipt on Base Sepolia (requires the contract to be
deployed and `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` set).

Admin shows **one consistent mint state derived from verified facts only**:
a broadcast-but-unverified mint reads **Mint in progress**, never **Minted**.
After **Reset the book**, MRA-001 and MRA-010 return as fresh `funding`
offers with **no on-chain facts** and a **new chain-store epoch** starts so
old on-chain facts are never reused. Reset does **not** roll back the chain;
the env contract address stays active so approved offers mint again on the
same deployment.

Customer-facing status wording (Under review → Listed → Sold → Paid plus
Denied / Expired / Closed) stays on customer surfaces; **Mint pending,
Minted, token #, NFT, contract, Safe mint, and Funding** wording lives in
Admin only.

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
- Account books are isolated: a payment request, offer, or portfolio link
  from another account's book shows a friendly not-found and leaks nothing.
- A copied `/pay/…` link opened in another account or a signed-out browser
  never reveals the payment request or payer data.
