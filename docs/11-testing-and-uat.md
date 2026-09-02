# 11 - Testing and UAT

**Purpose:** How we verify the Direct / Pay Buildathon demo.
**Last updated:** September 2, 2026 (interim wallet identity)

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
Property Score, payment book, app-link, host-gate, chain-verification, or
contract-helper behaviour changes incorrectly.

Wallet identity tests cover challenge binding, signature verification, expiry,
single-use challenges, and tamper-resistant session cookies. The interim wallet
flow also requires manual verification that Reset is performed by the connected
wallet, wallet-scoped pages reject another wallet, and Portfolio follows the
live NFT owner after a transfer.

Pricing tests must reproduce MRA-001 locked figures and the 24% block.
Property Score tests must cover band boundaries, clamping, invalid market
rent, the 0.60 → 1.10 example, and proof that derived Property Score does
not change quote pricing. Payment tests must prove one confirmed deposit
cannot duplicate collection or claim, that a deposit requires the exact
monthly amount, and that a claim by a non-owner is rejected. App-link tests must prove external
HTTPS URLs open externally and missing or invalid URLs stay inside the demo.
Verification tests must prove the server matches the exact expected
event/log (mint, purchase, transfer, deposit, claim) and rejects
self-transfers, wrong amounts, wrong network, and duplicate confirmations.
Tests must also cover: the display-only 60-day window (offer stays
purchasable after the date, no Expired status derives from it), Reset
starting a new chain-store epoch (old on-chain facts are never reused), the approval receipt completing before
purchase/deposit begins, pending outcomes exposing only **Check status**,
informational-only Pay QR / copy controls (they never submit a payment;
`depositRent` is the only path), customer statuses (Paid = proceeds card
only; the offer stays Sold), **Save draft** persistence, and Admin
mint-state consistency (broadcast-but-unverified reads "Mint in progress",
never "Minted").

GitHub Actions runs the same commands via `.github/workflows/verify.yml`.
The first passing remote run on `main` was 2026-08-19 (run 32228015203).

## Critical flows (engineering)

1. Home shows Merkado Direct entry points. Hosted access first requires the
   deployment pass, then Google or email magic-link sign-in. Reset lives in
   Admin.
2. Direct nav is Home, My Offers, Create Offer, Simulator, Marketplace,
   Portfolio, plus Pay, Account, and Admin at the bottom.
3. My Offers is empty until you create an offer via Create Offer;
   draft/unsold rows are not counted as cash already advanced. A **Save
   draft** button persists the wizard's in-progress offer into **My Offers →
   Draft** (landlord workflow only; no chain or payment state).
4. Simulator: Listing Score and Payer Score sliders; market rent in XCG;
   Property Score; 3 months disabled; 9/12 simulation-only; Use this quote
   disabled when unapproved or above 24%.
5. Use this quote prefills Create Offer. 9/12 cannot submit.
6. Offer detail: landlord sees review / listed / sold / paid, the locked
   payout destination, and no listing expiry; no holder or monthly
   collection detail. Operations controls are only in Admin. The
   **Landlord proceeds** card moves **Waiting → Processing → Paid**
   automatically (Processing = purchase submitted but not yet verified);
   **Paid** is the proceeds card only and the offer itself stays **Sold**.
   Listed offers show the **Listed for 60 days** next step and the
   display-only **"Available until [date] · 60-day listing window"** text.
7. Marketplace: no tenant name or address; **mint-pending offers are not
   listed** (their detail page stays reachable with a Mint pending alert);
   server rejects fractional purchases; a whole-offer purchase pays the exact
   purchase price to the locked landlord address and moves the NFT Safe →
   buyer atomically. Cards carry the display-only **"Available until [date] ·
   60-day listing window"** text — the offer stays purchasable after the date
   and no Expired status derives from it. Empty active contract address shows a
   not-configured state.
8. Portfolio: Position ID; offer token id; accrued rent per token; the
   current NFT owner can `claimRent`; non-owners are rejected.
9. Pay: seeded request **XCG 3,222.00** / **1,800.00 USDC** on the selected
   network (**Base Sepolia** after Reset); `depositRent(tokenId,
   opaquePaymentId, amount)`; visible pending then success; invalid id is a
   safe not-found. The expanded **Pay with stablecoin** panel holds the
   **QR**, **copy address**, and **copy amount** controls as **informational
   only** (never submit a payment), with the live **Connect**, **Approve
   USDC**, and **Pay rent** actions. **Continue with Sentoo** is a collapsed
   panel with a **Coming soon** badge.
10. One confirmed deposit appears once in Pay history, My Payments, offer
    collections, and holder claimable rent. Refresh does not duplicate.
11. Apps cards have working internal fallbacks and accessible new-tab
    behaviour only for absolute URLs.
12. Customer screens do not show a sale-not-loan wall, fee buildup, or
    extra comparison figures. Status pills stay limited to **Under review →
    Listed → Sold → Paid** plus **Denied / Expired / Closed**; no mint / NFT
    / contract wording appears on customer surfaces.
13. Two authenticated accounts have isolated books. A draft, payment request,
    offer, wallet link, or Portfolio position from Account A is not visible to
    Account B. A copied foreign URL returns a safe not-found response.
14. The same authenticated account can create an offer, buy an offer with its
    linked wallet, pay rent, and claim rent. Wallet connection alone does not
    link the wallet; replayed or expired link signatures are rejected.
15. Non-admin accounts cannot open Admin or invoke Reset. Admin Reset keeps
    the current confirmation UX, resets all account books, starts one active
    epoch, preserves network/contract configuration, and does not roll back
    Base Sepolia.

## Manual Base Sepolia E2E (run once the flow is deployed and activated)

This guide replaces the old mocked walkthrough. The flow is the live flow on
**Base Sepolia**; it works only after the contract is deployed,
`NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` is set, the chain store migration is
applied, and the Product Lead has approved activation. Do this with test
USDC only. Judge copy, clarity, and whether a landlord or tenant would
misunderstand this as a loan. After each item, reply with what you saw if
it felt wrong.

### Before you start

1. Confirm `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` is set to the verified
   Base Sepolia contract and `MERKADO_RPC_URL` points at
   `https://sepolia.base.org`.
2. Open **Admin** at the bottom of the left nav. Click **Reset the book** and
   confirm **Yes, reset**. The book is seeded fresh — **MRA-001** and **MRA-010**
   return as `funding` offers with **empty on-chain state** — approve them in
   Admin, and the backend mints them automatically. A **new chain-store epoch**
   starts so old on-chain facts are never reused.
3. Fund test wallets with Base Sepolia ETH (gas) and test USDC from
   [faucet.circle.com](https://faucet.circle.com).

### 1. Home

- The page starts with **Rent paid forward**. It does not repeat
  "Merkado Direct" as a small eyebrow above the heading.
- Featured Marketplace cards are visible. Buttons are violet, not black.
- You do **not** see a long sale-not-loan box, Reset, or legal questions.

### 2. Simulator

- Monthly rent shows **3222.00** XCG. Typical nearby rent shows **5370.00**.
- Property quality 89 and Payment history 95 are sliders with live numbers.
- Click **Small studio**. Rent becomes **1.79**. The cash to the
  landlord is about **XCG 10.17**.
- 3 months is disabled. 6 months can use the quote.

### 3. Create offer and Admin (mint by Safe)

- From the XCG 10 example, click **Use this quote**.
- Add a cover photo if you want. On **Payout**, lock the landlord payout
  destination. On Review, the page should say you do not need a wallet.
  Click **Submit request**.
- Open **Admin**. Open the new offer. Pick **Enrique** or **Luuk**, then
  click **Approve offer**. The backend broadcasts `mintOffer` from the server-held mint key and
  verifies the receipt; Mint Control shows the verified status. One offer NFT is
  minted to the backend mint key. A broadcast-but-unverified mint must read
  **Mint in progress**, never **Minted** (Admin derives mint state from
  verified facts only).
- On the offer detail, confirm the offer is Listed, has no expiry, and the
  backend mint key is the initial owner on the explorer (real 64-hex mint
  hash only).

### 4. Marketplace — whole-offer purchase

- Open **Marketplace**. You see the funded Sun Set Heights house and the
  open **Punda** studio (MRA-010).
- Open the **Punda** studio. The card shows one whole-offer price and no
  fractional option.
- Connect the Reown/AppKit wallet (must be on Base Sepolia; wrong-network is
  rejected with a prompt to switch). Click **Purchase whole offer**.
- The buyer pays the exact purchase price **directly to the locked landlord
  payout address** and the NFT moves minter → buyer atomically.
- Open **My Offers** for Punda. It is **Sold** and its Landlord proceeds card
  is **Paid**. There is no landlord claim button.
- Explorer shows the real sale transaction: the USDC transfer to the
  landlord address and the ERC-721 transfer Safe → buyer in the same block.

### 5. Renter — deposit rent

- Open **Merkado Pay**. MRA-001 is **XCG 3,222.00**. After purchasing
  MRA-010, a **XCG 1.79** rent also appears.
- Open the XCG 1.79 payment. The expanded **Pay with stablecoin** panel
  shows the **QR**, **copy address**, and **copy amount** controls as
  **informational only** — using them must never submit a payment.
  **Continue with Sentoo** is a collapsed panel with a **Coming soon**
  badge. The pay action calls
  `depositRent(tokenId, opaquePaymentId, 1000000)` (1.00 USDC atomic)
  through the live **Pay rent** action.
- Confirm in the wallet. You should see pending, then **Rent paid** only
  after the server verifies the deposit event.
- Deposit the same month again: the second attempt must be rejected
  (already paid). A wrong amount and a duplicate payment id must be rejected;
  unique payment ids keep working (the contract has no deposit cap).
- A later month (for example November) says to pay the earlier month first.
- You never see a fee, holder name, or distribution figure.
- Refresh the success page. The payment is still there once.

### 6. Owner claim and transfer

- In **Portfolio**, the position for Punda shows accrued rent. The current
  owner clicks **Claim rent** (`claimRent(tokenId)`). The USDC moves from
  the pooled contract to the owner's wallet. Explorer shows a real claim
  hash.
- **Non-owner rejection:** connect a second wallet that does not own the
  NFT. **Claim rent** must be rejected (or hidden) with a clear message.
- **Transfer to a new owner:** send the Punda NFT from the holder wallet to
  a second wallet (a normal ERC-721 transfer). The second wallet is now the
  holder. From that wallet, deposit another month's rent, then **Claim
  rent** as the new owner. It must succeed.
- Confirm the pooled-balance invariant holds after deposits and claims
  (contract USDC balance ≥ total deposited-but-unclaimed rent).

### 7. Wrong network and not-configured state

- Connect a wallet on a network other than Base Sepolia. Purchase and
  deposit must prompt a chain switch and reject on the server.
- Temporarily clear `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` (local only).
  Purchase and pay actions must show the quiet **not configured** state and
  never fake a transaction.

### 8. Account Apps and Pay

- Account looks like merkado.cw account: same logo, top nav, footer,
  breadcrumb, and left nav groups. The profile is **Luuk Weber** with the
  photo avatar. There is no Admin item. **Apps** sits above **Account**.
  Marketplace, Plan & Billing, Account Settings, Cars, Real Estate,
  Create a listing, and Log out look disabled. **Merkado Pay** and
  **Merkado Direct** are clickable.
- Open **Merkado Pay**. The same page has this month's payment and
  **Payment history** underneath. There is no second payments page.
- On a phone, the top menu and left account nav show the same links.

### 9. Reset

- Open **Admin**. **Reset the book** seeds a fresh demo book (**MRA-001** and
  **MRA-010** as `funding` offers with **empty on-chain state**) and starts a
  **new chain-store epoch** so old on-chain facts are never reused. The
  payment network you selected and the env contract address stay active.
  On-chain state is **not** rolled back by Reset — approved offers mint again
  on the same deployment. Pairing Reset operationally with a fresh Base
  Sepolia contract redeploy + env address update is a separate approved gate;
  deployed contracts and their balances keep their chain state until then.

### What you are judging

- Would a landlord think this is a loan?
- Would a renter think their lease or rent changed?
- Would a holder think they can buy in today, or that collections are
  guaranteed?
- Is the live Base Sepolia demo easy to explain without sounding like
  production?

If the live Base Sepolia walkthrough looks correct, reply:
`Approved, commit and push.` This does not approve Base Mainnet, real
funds, or production activation.
