# 07 - Integrations

**Purpose:** What this Labs demo connects to, and the crypto developer handoff.
**Last updated:** August 21, 2026 (Luis handoff after Luuk flow review)

## Live

| System | Use |
|---|---|
| Labs Supabase `csaefdkpwukshtouyixg` | Demo book, RLS, service-role server access |

## Not in this repo

| System | Where it lives now |
|---|---|
| Listing scrapers / pipeline / Terra | merkado-cw |
| Production Auth / merkado.cw storefront | merkado-cw |
| OpenAI enrichment | not used in Labs |
| Real wallet / Safe SDK / RPC / USDC transfer | Not installed. Replace the mock provider only after Product Lead approval. |
| Vercel production deploy | not authorised from this repo |

## Optional Labs configuration

These are local/demo direction only. They do not authorise deployment.

| Name | If empty |
|---|---|
| `NEXT_PUBLIC_MERKADO_PAY_URL` | Apps card uses `/pay` |
| `NEXT_PUBLIC_MERKADO_DIRECT_URL` | Apps card uses `/originate` |
| `NEXT_PUBLIC_PAY_NETWORK` | Demo defaults to **Base Sepolia** (`base-sepolia`) |

Allowed `NEXT_PUBLIC_PAY_NETWORK` values for this walkthrough:
`base-sepolia` now, `base-mainnet` later. Use the full keys only. Admin
shows Base Sepolia. Base Mainnet appears only when this env is already
`base-mainnet`. Reset keeps the selected Base testnet.

Optimism keys (`op-sepolia`, `op-mainnet`) stay in the catalog if Luis
later opts in. They are hidden in Admin until then.

Open a new tab only when the app URL value is an absolute external URL.

## Later

- Bank / Stichting statements as attested collection evidence
- Written counsel opinions to lift Stage 0 gates
- Real wallet connection and native USDC transfer on **Base Sepolia** first,
  then **Base Mainnet** when approved
- Girasol landlord bank payout after fees, KYC, API, and failure handling are
  approved
- Sentoo renter bank payment after consent, bank-data, callback, and
  reconciliation design are approved
- Optional move of this demo toward `direct.merkado.cw` and `pay.merkado.cw`

---

## Crypto developer handoff (Luis / Luuk)

**Send this whole file.** The product walkthrough already works with a
**walletless landlord**. Architecture change: ADR-0006.

Luis status on 2026-08-21 (nothing merged):

- [PR #19](https://github.com/Kolektivo/merkado-labs/pull/19) Wave 1:
  Reown external-wallet foundation. Inactive while the rail is mock.
- [PR #20](https://github.com/Kolektivo/merkado-labs/pull/20) Wave 2:
  verified Base Sepolia deposit Safe + payment verification. Inactive
  while the rail is mock. Do not change this renter-verification work.
- [PR #22](https://github.com/Kolektivo/merkado-labs/pull/22) Wave 3 is now
  product-stale: it adds a manual landlord claim and still auto-pays holder rent.
  Do not merge that behavior. Rework it to payout-first automatic landlord
  execution plus holder-initiated claim from the per-offer contract.
- Deposit flow is implemented on his stack but not fully tested.
- NFT / listing-offer flow is still mocked. Luis plans to test and
  implement it next. Do not document it as live.
- Do **not** merge these PRs or flip `PAYMENT_RAIL_MODE` until the Base
  Sepolia walkthrough works and the Product Lead approves.

Final audit blockers found on Luis’s draft stack:

1. When the rail is live, `confirmPaymentAction` / `payerPayNowAction`
   must reject mock confirmation. Only verified chain evidence may mark
   rent paid.
2. PR 20 compares a 32-byte ERC-20 topic with a 20-byte address. Decode
   the padded Transfer topics (prefer viem), test with a real Base
   Sepolia receipt, and accept log index `0` as valid.
3. Verification currently requires the one company Safe. After sale it
   must verify the payment request’s **listing collection address**.
   Company Safe, sales-proceeds Safe, and listing collection are separate.
4. A mock build must not show the real 2-of-3 Safe as its copy-address
   destination. Show it only when live verification is the sole success
   path.
5. The shared demo book has no landlord / renter / holder authorization.
   Do not attach real funds to a URL where any visitor can claim, confirm,
   overwrite, or Reset the shared book.
6. Luis’s stack introduced `usePaymentProvider()` in Pay while `main`
   uses `createPaymentProvider()`. Reconcile that seam after rebase; do
   not assume changing the factory alone switches his Pay screen.

Until these are fixed and tested: no test USDC, no migration execution,
no merge, and no live-rail switch.

One confirmed rent payment still updates My Payments and the offer
**once**. That listing then holds the rent. Portfolio shows it as ready
to claim. The connected holder clicks **Claim rent**. The landlord sale
amount is sent automatically to the destination saved before submission.

The missing live piece is still a real Web3 adapter, plus **two Safes**
and an **offer contract**, not one shared deposit address.

**Do not install a wallet or Safe SDK until the Product Lead approves that
integration task.** The current demo must keep working without a real
wallet, RPC, or on-chain write.

Product Lead access to grant you is listed under **Access Luis needs**
below and, with click-by-click steps, in `docs/12-deployment-runbook.md`.

### What is already finished

The demo is a working rent-paid-forward walkthrough, not a sketch:

1. Landlord requests a six-month offer from their Merkado account. No
   wallet. After approval, Merkado creates the offer.
2. Renter opens a payment link, copies the address or connects a **demo**
   wallet, sees pending, then Rent paid.
3. That one confirmation updates My Payments and the offer collection
   **once**. The holder then claims rent from that listing. Refresh does
   not double-pay.
4. A later month cannot be paid while an earlier month is still open.
5. Reset in Admin restores the seeded book and keeps the selected
   payment network.

Your job is to make the same buttons talk to **native USDC on Base
Sepolia**, without rewriting pricing, offers, collections, or the demo
book rules. Move to **Base Mainnet** only after the Product Lead turns
it on.

### Approved networks

Use `src/lib/pay/networks.ts` and `DemoBook.cryptoConfig`. Do not
hard-code a chain. Read `config.chainId` and `config.usdcContract`.

| Key | Label | Use now | Chain ID | Native USDC | Explorer |
|---|---|---|---|---|---|
| `base-sepolia` | Base Sepolia | **Approved testnet target. Active only on Luis’s draft stack; `main` stays mock.** | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `https://sepolia.basescan.org` |
| `base-mainnet` | Base Mainnet | **Later / real USDC** | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `https://basescan.org` |
| `op-sepolia` | OP Sepolia | Catalog only. Hidden in Admin unless Luis later opts in. | 11155420 | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` | `https://sepolia-optimism.etherscan.io` |
| `op-mainnet` | OP Mainnet | Catalog only. Hidden in Admin unless Luis later opts in. | 10 | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` | `https://optimistic.etherscan.io` |

Public RPCs (for your adapter only; this repo does not call them):

- Base Sepolia: `https://sepolia.base.org`
- Base: `https://mainnet.base.org`
- OP Sepolia: `https://sepolia.optimism.io` (later / opt-in)
- OP Mainnet: `https://mainnet.optimism.io` (later / opt-in)

Circle testnet USDC: [faucet.circle.com](https://faucet.circle.com).
Token is always Circle **native USDC**, 6 decimals. Not USDC.e / USDbC.

Older stored books used network key `optimism` or `op-sepolia`. Those
rematch to **Base Sepolia**. An explicit `base-mainnet` selection is kept
only when mainnet is enabled.

### Product decisions already made

| Topic | Decision |
|---|---|
| Network now | **Base Sepolia** (Base testnet) |
| Network later | **Base Mainnet**, when the Product Lead is ready for real USDC |
| Token | Circle **native USDC** for the selected network. Not USDC.e. |
| Decimals | 6 |
| Explorer | Official explorer for the selected network — only link a real 64-hex `0x` hash |
| Customer money | **USD**. Stored as integer cents. |
| Settlement money | **USDC**, 1:1 with USD. `$1,800.00` rent = `1,800.00 USDC` = `1800000000` atomic. |
| Company Safe | Creates offers. Draft PR 20 already has Base Sepolia Safe `0xfC6ec9718d89d4935594E7DB78399913071FcDc4` (2 of 3: Enrique, Luuk, Luis). Not on `main`. The exact live fee sweep is still open and must never reduce the landlord below the displayed purchase price. |
| Sales proceeds Safe | **New.** Dedicated Safe for NFT / offer sale USDC. Same testnet. Same owners unless Luuk says otherwise. |
| Listing offer | **One NFT / listing offer per listing.** Tracking, later resale, and so Merkado is not holding monthly rent. |
| Offer collection address | After sale, monthly rent goes **to that listing**, not the company Safe. The listing collects rent. |
| Landlord payout | The destination is selected before submission. Mock now: a whole-offer purchase immediately marks the purchase price paid to the saved fictional `0xDEMO…` address, with no transaction or fake hash. Live: Merkado automatically sends from the sales proceeds Safe. The landlord does **not** connect a wallet, click claim, or pay gas. |
| Holder purchase | 100% of one offer only. No fractions. Connect and ownership UI is a mocked **Connect wallet** button on `main`; Luis chooses WalletConnect, Privy, or another adapter and replaces the mock. |
| Holder claim | Holder calls the listing’s claim from Portfolio. Labs is mocked and does not verify ownership. Live must verify the current owner. Not automatic. Luis is confirming whether that `claim()` can be sponsored. |
| Listing expiry | `publishedAt + 60 days`. The purchase path must reject an expired offer server-side. |
| Fiat previews | Girasol landlord payout and Sentoo renter payment are Coming soon UI only. Do not send or persist entered demo bank data. |
| Wallet in this repo | Mocked on `main`. No SDK installed here. Your draft PRs stay unmerged. |

MRA-001 locked Pay request:

- ID: `payreq-mra-001-202609`
- Period: September 2026
- Rent: **$1,800.00**
- Amount to send: **1,800.00 USDC** (`1800000000`)
- Human reference: `MRA-001-01` (not encoded in a plain ERC-20 transfer)

### What you replace (one factory)

| Piece | Path | Your action |
|---|---|---|
| Factory the UI already calls | `src/lib/pay/create-provider.ts` | Point this at your adapter |
| Interface you must implement | `src/lib/pay/provider.ts` | Do not change the method names the UI uses |
| Current mock | `src/lib/pay/mock-provider.ts` | Keep until the real adapter is approved |
| Network / USDC / explorer facts | `src/lib/pay/networks.ts` and `DemoBook.cryptoConfig` | Fill the real company and sales proceeds Safes here when confirmed |
| Amount math | `src/lib/rent-advance/money.ts` | Do not change the 1:1 USD↔USDC rule |
| Book write / no double-pay | `src/lib/rent-advance/payment-apply.ts` | Do not rewrite. Pass the real tx hash in. |
| Server save | `confirmPaymentAction` in `src/lib/rent-advance/actions.ts` | Already accepts `txHash` / `transactionId` |
| Pay screen | `src/app/pay/pay-app.tsx` | Keep talking only to `PaymentProvider` |
| Pay history | Same Pay screen | Reads the same book. No extra adapter. |

Exact factory today:

```ts
export function createPaymentProvider(config?: CryptoConfig | null): PaymentProvider {
  return createMockPaymentProvider({ config });
}
```

Replace that body with your adapter. Keep the Pay UI on
`createPaymentProvider`. Read the selected network from `config`.

### Provider contract

`PaymentProvider`:

- `connect()` → `{ address, connected, chainId }`
- `disconnect()`
- `session()`
- `submitPayment({ paymentRequestId, expectedAtomicAmount, recipient, offerReference, receivableId, method: "wallet" })`
- `reportExternalTransfer({ …, method: "external" })` — copy-address path; no connected demo wallet required
- `getStatus(transactionId)`

`submitPayment` / `getStatus` must return:

- `transactionId`, `txHash`, `chainId`
- `from`, `to`, `tokenContract`, `atomicAmount`
- `status`: `submitted` | `pending` | `confirmed` | `failed` | `replaced`
- optional `errorCode` / `errorMessage` (user-safe)

The Pay screen already maps those into the demo book through
`confirmPaymentAction(id, outcome, { txHash })`. The server assigns the
ledger id itself. It only stores a `txHash` that is a demo `0xDEMO…`
value or a real 64-hex hash. Client `transactionId` and labels are
ignored so a crafted payload cannot overwrite the landlord settlement
row.

That book write is already correct: confirmed → payment request paid,
receivable received, one collection, and a **pending** holder claim.
Do not add a second write path. Do not auto-pay the holder.

Do **not** reuse `confirmPaymentAction` as the live confirmation API.
When Pay goes live, confirm on the server from chain data, then write
the book.

### Which flow, which step, what you hook

#### Flow A — Renter pays rent (Merkado Pay)

This is the only flow that later needs inbound USDC to the offer address.
Labs Pay does not show Connect wallet.

| Step | What the user sees | What happens now | What you add |
|---|---|---|---|
| 1. Open Pay | Hub → Merkado Pay, or `/pay` | Loads the next unpaid request for the demo renter | Nothing |
| 2. Deep link | `/pay/payreq-mra-001-202609` | Shows 1,800.00 USDC, $1,800.00 rent, selected network, offer collection address | After sale, this is the offer address, not the company Safe |
| 3a. Scan or copy | The Labs QR uses an inert `merkado-demo:` payload with offer address, amount, and human reference; copy address + **I’ve sent this payment** is the only Pay confirmation | QR is informational only; `reportExternalTransfer`, then pending → confirmed | Replace the demo payload with a chain-aware ERC-20 request, parse it safely, and watch the per-offer address for inbound native USDC of `expectedAtomicAmount` |
| 3b. Connect wallet | Not shown on Pay | Removed from the renter UI | Do not add a Pay wallet connect unless Product Lead re-approves it. Holder connect stays on Marketplace and Portfolio. |
| 5. Submitted | “Payment submitted” | Book status `pending` | Keep pending until the tx is indexed |
| 6. Confirmed | “Rent paid” | Book writes collection + holder distribution once | Call `confirmPaymentAction(id, "confirmed", { txHash })` only after you consider it confirmed |
| 7. Revisit | Same page stays paid | Idempotent. Second confirm does nothing | Do not send a second transfer |
| 8. Later month | November while September is open | Page says pay the earlier month first | Do not allow a transfer for a blocked month |
| 9. Failed / wrong amount | Demo outcome menu, or your error | Book `failed` or `partial` | Map wallet reject, revert, and amount mismatch to those outcomes |
| 10. Unknown link | Friendly not-found | No other payment data leaked | Keep that privacy wall |
| 11. Sentoo | Collapsed **Continue with Sentoo** row with logo; expands fictional bank fields and a disabled action | Client-only preview; nothing persisted | Add only after API contract, consent, callback verification, reconciliation, and bank-data ownership are approved |

Do **not** treat the first click as a confirmed chain receipt. Keep
submitted / pending / confirmed distinct.

#### Flow B — My Payments (inside Merkado Pay)

| Step | What the user sees | Your work |
|---|---|---|
| Open Pay | This month’s payment link | Same as Flow A |
| Pay → My Payments | Next 1,800.00 USDC on the selected network | None. It reads the book Pay already wrote |
| Pay rent | Opens the matching Pay deep link | Same as Flow A |
| History | Paid / open / upcoming months | None |

#### Flow C — Landlord (Merkado Direct)

No landlord wallet. Merkado does the on-chain work.

| Step | Screen | Your work |
|---|---|---|
| Choose payout | Create Offer → Payout | Use the saved payout record. Crypto is active in the demo; Girasol bank payout is Coming soon. Never send bank fields to chain or holder payloads |
| Request offer | Create Offer | No wallet for the landlord. Reject submission without an enabled payout destination. After Admin approval, **your system** creates the offer from the company Safe |
| List | Admin approval | Set the publication time and 60-day expiry. Reject purchase after expiry |
| Automatic sale payout | Whole-offer purchase | Split the fee without reducing the displayed purchase price, then automatically send net USDC from the **sales proceeds Safe** to the saved destination. Merkado pays gas |
| See payout | My Offers / offer detail | Show processing / paid / failed. No landlord claim button. Explorer link only if a **real** tx hash exists |
| Record collection | Admin offer → Record collection | Off-chain fallback. Does not pay the landlord again |

#### Flow D — Holder (Marketplace + Portfolio)

The holder already has a wallet because they buy the offer.

| Step | Screen | Your work |
|---|---|---|
| Connect | Marketplace and Portfolio | Replace the **Connect wallet** mock with the approved adapter and verify network + ownership |
| Buy | Marketplace | Buyer purchases 100% of the offer. Sale USDC goes to the **sales proceeds Safe**. Atomically move the offer/NFT to that holder and trigger landlord payout |
| Rent arrives | Merkado Pay | After sale, `receivingAddress` is the **offer collection address** |
| Claim rent | Portfolio | Reverify current owner wallet, then let that owner take USDC out of **that listing**. Not automatic. Confirm if `claim()` can be sponsored |

You still owe the production design for the offer contract (how each
listing receives USDC and how the current holder claims).

### Inputs already on the payment request

Use these. Do not invent a second amount. Do not hard-code a chain.

- `paymentRequestId`
- `offerReference` (example `MRA-001`)
- `receivableId`
- `amountUsdcAtomic` (example `1800000000`)
- `receivingAddress` (after sale this is the offer collection address, not the company Safe)
- `paymentReference` (human only)
- `dueDate` / `periodLabel`
- `cryptoConfig.networkKey` (`base-sepolia` by default)
- `cryptoConfig.chainId`
- `cryptoConfig.usdcContract`
- `cryptoConfig.explorerBaseUrl`

### Decisions you still own

1. **Allocation.** After sale, each offer has its own collection address, so
   rent matching is per offer. A plain USDC transfer still has no memo. If
   more than one month can hit the same offer address, you still need a
   verified matching design. Matching only amount and time is not enough.
2. **Two test Safes on Base Sepolia.** Keep the existing 2-of-3 company
   Safe from PR 20 for offer creation and fees. Create a **second** sales
   proceeds Safe. Send both addresses to the Product Lead before writing
   them into `cryptoConfig` on a live branch. Do not create these on
   Base Mainnet yet.
3. **Offer contract + holder claim.** After sale, rent must land on
   **that listing’s offer**, and the current holder must be able to
   **claim** through our UI. One NFT per listing. Pick the contract shape
   (ERC-721 + `claim()` / withdraw, token-bound account, or per-offer
   Safe) and get it approved. Do not describe Merkado as a custody
   product — the listing holds the rent. Do not describe this as escrow
   without counsel.
4. **Automatic landlord payout execution.** Merkado / the sales proceeds Safe
   sends USDC to the destination saved before submission as part of the
   whole-offer sale workflow. The landlord never connects a wallet or clicks
   claim. Define atomicity, retry, idempotency, and failed-payout operations.
5. **Holder `claim()` sponsorship.** Luuk asked Luis to confirm whether
   the listing claim can be sponsored. If yes, holders can claim without
   paying gas. If not, they sign with the wallet they already used to
   buy. Do not block the pilot on sponsorship.
6. **How many confirmations** before the Pay UI may say Rent paid.
7. **Wallet onboarding.** Recommend WalletConnect, Privy, or both, including
   ownership revalidation on Portfolio claims, session expiry, chain switching,
   and account changes.
8. **Fiat partners.** Confirm Girasol and Sentoo contracts, fees, KYC/consent,
   redirect/callback security, reconciliation, refunds, failure handling, and
   which system may store bank data. The current UI stores none.

### What you must not do

- Do not install a wallet/Safe SDK until the Product Lead says so.
- Do not hard-code one chain. Read `cryptoConfig`.
- Do not send USDC.e or USDbC.
- Do not send mainnet USDC while a testnet is selected.
- Do not touch production Supabase `jkrfyvukhhsapoivntms`.
- Do not rewrite `applyPaymentOutcome` idempotency.
- Do not show fee, purchase price, or holder economics on Pay.
- Do not treat this as a public token market. Merkado creates the listing
  offer, then the buyer holds it. Do not build Merkado as a custody
  product that holds monthly rent.
- Do not link demo `0xDEMO…` hashes on the explorer.

### Flip the mock labels when the rail is live

The UI is already wired so mocked wording does **not** have to be hunted
down by hand. In the **same change** that points
`createPaymentProvider` at your adapter:

1. Open `src/lib/pay/mode.ts`.
2. Set `PAYMENT_RAIL_MODE` from `"mock"` to `"live"`.

That single switch updates:

| Surface | Mock copy (today) | Live copy (after the flip) |
|---|---|---|
| Overview banner | Wallet and USDC payments are mocked | Pay sends USDC on the selected network |
| Overview Pay card | Demo only — nothing real is sent | Pays in USDC on the selected network |
| Payment network help | Stay on Base Sepolia. Base Mainnet stays off until we turn it on | Stay on Base Sepolia until the Product Lead turns on Base Mainnet |
| Payment network body | The demo wallet still does not send real money | A connected wallet sends USDC on this network |
| Pay button (reserved; Labs Pay shows **I’ve sent this payment**) | Pay with demo wallet | Pay with wallet |
| Connected line (reserved; not shown on Pay) | Demo wallet connected | Wallet connected |
| USDC tip | Nothing real is sent | Amount matches rent one-to-one |
| Network tip | Nothing real is sent in this walkthrough | Settles on the selected network (testnet named) |
| Footer note | Demo only. This walkthrough does not send a real transfer | Testnet: this sends test USDC, not mainnet money. Mainnet: this sends real USDC |
| Demo outcomes menu | Visible (Success / Failed / Incorrect amount) | Hidden |
| Ledger from / to | Renter demo wallet / Offer collection address | Renter wallet / Offer collection address |

Do **not** flip the switch while the factory still returns the mock
provider. A live label on a fake transfer is worse than a mock label.

If you add new Pay strings, put the mock default in `payerCopy` and the
live override in `applyPaymentRailCopy` (`src/lib/rent-advance/copy.ts`).

### Pay UI you must change (not only the factory)

`src/app/pay/pay-app.tsx` still **trusts the browser** and then writes
the book:

1. `submitPayment` or `reportExternalTransfer`
2. `confirmPaymentAction(id, "pending")`
3. wait 1.4 seconds
4. `confirmPaymentAction(id, "confirmed")`

That is correct for the mock walkthrough. It is **not** correct once a
real transfer exists.

When the rail is live:

- Keep pending until **your server** has seen the USDC transfer on the
  selected chain (receipt + your confirmation depth).
- Only then write the book as confirmed, with the real 64-hex `txHash`.
- Do **not** let the client mark rent paid because a wallet popup closed.
- Keep using `applyPaymentOutcome` / the existing book helper so one
  confirm still updates Pay, the offer, and Portfolio once.
- Hide or ignore the demo outcome menu (`showDemoPaymentOutcomes()`
  already hides it when the rail is live).
- Replace the fictional Safes in `cryptoConfig.companySafeAddress` and
  `cryptoConfig.salesProceedsSafeAddress`. After sale, Pay uses the offer
  collection address, not the company Safe.
- Prompt a chain switch when the wallet `chainId` is not
  `cryptoConfig.chainId`.

### Suggested implementation order (after approval)

1. Confirm **Base Sepolia** + native USDC + Safe services together.
2. Put the real company Safe and sales proceeds Safe in `cryptoConfig`.
3. Implement `PaymentProvider` against `provider.ts`.
4. Switch `createPaymentProvider` to that adapter.
5. Flip `PAYMENT_RAIL_MODE` to `"live"` in the same change.
6. Watch the offer address for inbound USDC. Do not add Connect wallet on
   Pay unless Product Lead re-approves it. Holder Connect wallet stays on
   Marketplace and Portfolio.
7. Confirm on the **server** from chain data, then write the book.
8. Only then show explorer links for real hashes.
9. Separately design allocation and holder-distribution execution.
10. Only after the Base Sepolia walkthrough works, ask to repeat the Safe
    setup and pay flow on **Base Mainnet**.

Useful references: Circle USDC contract addresses, Circle USDC faucet,
Safe Smart Account overview, Safe Transaction Service, Safe supported
networks.

### Access Luis needs

Ask the Product Lead for **only** the Labs surfaces below. Do not ask
for merkado.cw production, production Supabase, or production Vercel.

| Platform | What you need | Why |
|---|---|---|
| GitHub `Kolektivo/merkado-labs` | **Write** on this repo (collaborator or team) | Branch, pull request, review. Do not push straight to `main`. |
| Vercel team **Kolektivo Labs**, project `merkado-labs` | **Developer** or **Member** | Preview deploys of your branch. Not billing. Not the live merkado.cw project. |
| Supabase **merkado-labs** `csaefdkpwukshtouyixg` | **Developer** | Read schema and the demo book if you must debug persistence. |
| Labs env values | Secure copy of `.env.local` Labs keys | Run the demo locally against the Labs book. Never commit them. |
| Hosted walkthrough password | The `LABS_DEMO_PASSWORD` value, shared privately | Open https://merkado-labs.vercel.app after deploy. |
| Safe{Wallet} | Company Safe already exists on the PR 20 stack (2 of 3). Create a **second** Base Sepolia **sales proceeds** Safe. | Company Safe creates offers and takes fees. Sales proceeds Safe receives the whole-offer sale and executes the automatic landlord payout. |
| Reown / WalletConnect Cloud | A project you create or are invited to | Wallet connect project ID for the adapter. |
| Privy (only if selected) | Developer on a Kolektivo-owned Labs app | Embedded/external wallet onboarding without using a personal project. Do not add until the Product Lead approves the adapter choice. |
| RPC (optional) | Alchemy, Infura, or similar Labs-only key | More reliable than public RPCs. Not required to start. |
| Circle faucet | None. Public. | Test USDC: https://faucet.circle.com |

**Never:**

- Production Supabase `jkrfyvukhhsapoivntms` / merkado-curaçao
- Production Vercel / merkado.cw deploy
- GitHub admin on the Kolektivo org
- Supabase Owner on Labs (Developer is enough)
- A mainnet Safe that already holds real USDC
- Service-role or host password in the repo, a ticket, or chat history

Expected later env names (add only when the adapter needs them; do not
commit values):

- Wallet connect project ID (public)
- Server-only RPC URL, if you do not use the public catalog RPCs
- Optional explorer API key if you watch transfers from the server

### Done when

- Merkado can create an approved offer from the company Safe without a
  landlord signature.
- A connected holder purchases exactly 100% of the offer. The sale lands in the
  sales proceeds Safe, the fee goes to the company Safe, and the landlord net
  is sent automatically to the destination saved before submission.
- After sale, the renter sends **1,800.00** native USDC to the **offer
  collection address** on **Base Sepolia** and sees **Rent paid** only
  after the chain confirms it.
- The same confirmation updates My Payments and offer MRA-001 **once**.
  Portfolio shows the rent as ready to claim until the holder claims.
- Copy no longer says demo wallet / nothing real is sent (`PAYMENT_RAIL_MODE`
  is `"live"`).
- Explorer links open only for real 64-hex hashes.
- Mainnet stays off unless the Product Lead turns on **Base Mainnet**.
- Offer-contract design (one NFT per listing), automatic landlord payout,
  holder `claim()` (and whether it is sponsored), wallet onboarding, Girasol,
  and Sentoo
  are written up, even if not all built yet.

### Data ownership and privacy

- Allowed Supabase: Labs `csaefdkpwukshtouyixg` only.
- Forbidden: production `jkrfyvukhhsapoivntms`.
- Mock addresses must stay obviously fictional until replaced.
- Production payment links will need opaque, scoped, expiring
  authorization. Demo IDs are fictional and not a security model.
- Service-role stays server-only.
- If Labs persistence is unavailable, do not report a successful saved
  payment.
