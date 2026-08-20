# 07 - Integrations

**Purpose:** What this Labs demo connects to, and the crypto developer handoff.
**Last updated:** August 19, 2026 (approved OP Sepolia Web3 MVP: Privy + viem)

## Live

| System | Use |
|---|---|
| Labs Supabase `csaefdkpwukshtouyixg` | Demo book, RLS, service-role server access |
| Privy (`@privy-io/react-auth`) | External wallet connection only. Embedded wallets are not enabled. `NEXT_PUBLIC_PRIVY_APP_ID` (public App ID) must be set for real wallet login. |
| viem | Wallet client for the USDC `transfer` (client) and server-side on-chain verification (receipt, Transfer event, confirmation depth). |
| OP Sepolia public RPC (`https://sepolia.optimism.io`) | Temporary RPC for the server-side verifier. The Product Lead will supply a specific RPC later. |

## Not in this repo

| System | Where it lives now |
|---|---|
| Listing scrapers / pipeline / Terra | merkado-cw |
| Production Auth / merkado.cw storefront | merkado-cw |
| OpenAI enrichment | not used in Labs |
| Safe SDK/API, Safe watching, or holder-payout execution | Not part of this MVP. The receiving address is a **mock EOA**, not a Safe. |
| Base Sepolia / mainnet live payments | Not reachable in live mode. Live verification requires OP Sepolia. |
| Vercel production deploy | not authorised from this repo |

## Optional Labs configuration

These are local/demo direction only. They do not authorise deployment.

| Name | If empty |
|---|---|
| `NEXT_PUBLIC_MERKADO_PAY_URL` | Apps card uses `/pay` |
| `NEXT_PUBLIC_MERKADO_DIRECT_URL` | Apps card uses `/originate` |
| `NEXT_PUBLIC_PAY_NETWORK` | Demo defaults to **OP Sepolia** (`op-sepolia`) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Wallet login is disabled. Public App ID from the Privy dashboard; not a secret. Must be set to enable real external-wallet login. |

Allowed `NEXT_PUBLIC_PAY_NETWORK` values: `op-sepolia`, `base-sepolia`,
`op-mainnet`, `base-mainnet`. Use the full keys only. Overview can switch
the two testnets in demo mode. In live mode only **OP Sepolia** is
verifiable; Base Sepolia is demo-selectable only and mainnet stays off.
Mainnet choices appear only when this env is already a mainnet. Reset
keeps the selected test network.

Open a new tab only when the app URL value is an absolute external URL.

## Later

- Bank / Stichting statements as attested collection evidence
- Written counsel opinions to lift Stage 0 gates
- OP Mainnet or Base Mainnet, only when the Product Lead approves and turns
  them on; mainnet is **off** in the live MVP
- Optional move of this demo toward `direct.merkado.cw` and `pay.merkado.cw`

---

## Crypto developer handoff (Luis / Luuk)

**Send this whole file.** The Web3 MVP foundation is now implemented on the
feature branch: external-wallet login via **Privy**, USDC submission and
server-side on-chain verification via **viem**, and the same book write that
already updates My Payments, the offer, and Portfolio **once**. The live
rail is **not yet switched on** (`PAYMENT_RAIL_MODE` is still `"mock"`) and
the live wallet flow is **not yet verified end-to-end** on a real testnet
walkthrough.

The receiving address is the approved EOA
`0x1726cf86DA996BC4B2F393E713f6F8ef83f2e4f6`, labelled the **mock receiving
address**. It is an EOA, not a Safe. There is no Safe SDK, Safe watching, or
holder-payout execution in this MVP. Mainnet stays off.

Product Lead access to grant you is listed under **Access Luis needs**
below and, with click-by-click steps, in `docs/12-deployment-runbook.md`.

### What is already finished

The demo is a working rent-paid-forward walkthrough, not a sketch:

1. Landlord gets a quote and can save a six-month draft.
2. Renter opens a payment link, copies the address or connects a **demo**
   wallet, sees pending, then Rent paid.
3. That one confirmation updates My Payments, the offer collection, and
   the holder distribution **once**. Refresh does not double-pay.
4. A later month cannot be paid while an earlier month is still open.
5. Reset on Overview restores the seeded book and keeps the selected
   payment network.
6. The **Web3 foundation is implemented on the feature branch**:
   - Privy external-wallet login (no embedded wallets) behind the same
     Pay interface.
   - A viem live provider that submits the exact native USDC `transfer` to
     the receiving EOA on OP Sepolia.
   - Server-side on-chain verification (receipt, Transfer event, exact
     amount, correct token and recipient, **5-block** depth) before the
     book is confirmed through the existing idempotent helper.
   - Copy-address confirmation disabled in live mode.

Your remaining job is to **verify the live walkthrough end-to-end on OP
Sepolia**, then (with Product Lead sign-off) flip `PAYMENT_RAIL_MODE` to
`"live"` so the mock labels switch off. Pricing, offers, collections, and
the demo book rules stay untouched.

### Approved networks

Use `src/lib/pay/networks.ts` and `DemoBook.cryptoConfig`. Do not
hard-code a chain. Read `config.chainId` and `config.usdcContract`.

**Live MVP scope: OP Sepolia only.** The server-side verifier rejects any
chain that is not OP Sepolia (chain ID 11155420). Base Sepolia remains a
demo-selectable fact for the mock walkthrough, and mainnet stays off.

| Key | Label | Use now | Chain ID | Native USDC | Explorer |
|---|---|---|---|---|---|
| `op-sepolia` | OP Sepolia | **Live + default testnet** (Optimism / OP Mainnet test network) | 11155420 | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` | `https://sepolia-optimism.etherscan.io` |
| `base-sepolia` | Base Sepolia | Demo-selectable testnet only (not live-verifiable) | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `https://sepolia.basescan.org` |
| `op-mainnet` | OP Mainnet | Off. Later / real USDC | 10 | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` | `https://optimistic.etherscan.io` |
| `base-mainnet` | Base Mainnet | Off. Later / real USDC | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `https://basescan.org` |

RPCs:

- OP Sepolia: `https://sepolia.optimism.io` — used **temporarily** by the
  live provider and the server-side verifier. The Product Lead will supply
  a specific RPC later; replace it in the same place the adapter reads the
  URL.
- Base Sepolia: `https://sepolia.base.org` (demo only, not live-verifiable)
- OP Mainnet: `https://mainnet.optimism.io` (not used now)
- Base: `https://mainnet.base.org` (not used now)

Circle testnet USDC: [faucet.circle.com](https://faucet.circle.com).
Token is always Circle **native USDC**, 6 decimals. Not USDC.e / USDbC.

Older stored books used network key `optimism` (OP Mainnet). Those rematch
to the current default testnet. An explicit `op-mainnet` or `base-mainnet`
selection is kept.

### Product decisions already made

| Topic | Decision |
|---|---|
| Network now | **OP Sepolia only** for the live MVP. Base Sepolia remains demo-selectable but is not live-verifiable. |
| Network later | OP Mainnet and Base, when the Product Lead is ready for real USDC. **Off in the live MVP.** |
| Token | Circle **native USDC** for the selected network. Not USDC.e. |
| Decimals | 6 |
| Explorer | Official explorer for the selected network — only link a real 64-hex `0x` hash |
| Customer money | **USD**. Stored as integer cents. |
| Settlement money | **USDC**, 1:1 with USD. `$1,800.00` rent = `1,800.00 USDC` = `1800000000` atomic. |
| Receiving address | Approved EOA `0x1726cf86DA996BC4B2F393E713f6F8ef83f2e4f6`, labelled the **mock receiving address**. Not a Safe. No Safe SDK, Safe watching, or holder-payout execution. |
| Wallet | **Privy, external wallets only.** Embedded wallets are not enabled. `NEXT_PUBLIC_PRIVY_APP_ID` (public App ID) must be set for real wallet login. |
| Blockchain + verification | **viem.** Client submits the transfer; the server verifies receipt, Transfer event, exact amount, correct token and recipient, chain == OP Sepolia, **5-block** depth before writing the book. |
| Copy-address confirmation | Disabled in live mode. Only wallet-based payment confirms. |

MRA-001 locked Pay request:

- ID: `payreq-mra-001-202609`
- Period: September 2026
- Rent: **$1,800.00**
- Amount to send: **1,800.00 USDC** (`1800000000`)
- Human reference: `MRA-001-01` (not encoded in a plain ERC-20 transfer)

### What was implemented (the adapter foundation)

| Piece | Path | Status |
|---|---|---|
| Factory the UI already calls | `src/lib/pay/create-provider.ts` | Still returns the mock provider. Flip to the live path only after the live walkthrough is verified. |
| Provider factory for live | `src/hooks/use-payment-provider.ts` | Returns the live adapter when `PAYMENT_RAIL_MODE` is `"live"`, else the mock. |
| Client + provider wrapper | `src/lib/pay/privy-config.ts`, `src/lib/pay/privy-provider.tsx` | Implemented. External wallets only; no embedded wallets. |
| Live provider (viem) | `src/lib/pay/live-provider.ts` | Implemented. Submits the USDC `transfer` to the receiving EOA on OP Sepolia. Copy-address returns `external_not_supported`. |
| Server-side verification | `src/lib/pay/verify.ts` + `verifyLivePaymentAction` in `src/lib/rent-advance/actions.ts` | Implemented. Verifies receipt, Transfer event, exact amount, correct token/recipient, chain == OP Sepolia, **5-block** depth, then writes the book via `applyPaymentOutcome()`. |
| Network / USDC / explorer facts | `src/lib/pay/networks.ts` and `DemoBook.cryptoConfig` | Holds the approved EOA receiving address and OP Sepolia facts. |
| Amount math | `src/lib/rent-advance/money.ts` | Unchanged. The 1:1 USD↔USDC rule is preserved. |
| Book write / no double-pay | `src/lib/rent-advance/payment-apply.ts` | Unchanged. `applyPaymentOutcome()` remains the only book-write path. |
| Pay screen | `src/app/pay/pay-app.tsx` | Talks only to `PaymentProvider`. Live mode polls the server for confirmation and hides the copy-address button and demo outcome menu. |
| Pay history | Same Pay screen | Reads the same book. No extra adapter. |

The Pay UI stays on the provider boundary (`usePaymentProvider` /
`createPaymentProvider`). Read the selected network from `config`.

### Provider contract

`PaymentProvider`:

- `connect()` → `{ address, connected, chainId }`
- `disconnect()`
- `session()`
- `submitPayment({ paymentRequestId, expectedAtomicAmount, recipient, offerReference, receivableId, method: "wallet" })`
- `reportExternalTransfer({ …, method: "external" })` — copy-address path. In the mock adapter it walks the demo path; in the **live adapter it returns `external_not_supported`** because copy-address confirmation is disabled in live mode.
- `getStatus(transactionId)`

`submitPayment` / `getStatus` must return:

- `transactionId`, `txHash`, `chainId`
- `from`, `to`, `tokenContract`, `atomicAmount`
- `status`: `submitted` | `pending` | `confirmed` | `failed` | `replaced`
- optional `errorCode` / `errorMessage` (user-safe)

The Pay screen maps those into the demo book. In mock mode it uses
`confirmPaymentAction(id, outcome, { txHash })`. In live mode it polls
`verifyLivePaymentAction(paymentRequestId, txHash)`, and only that server
action may confirm the book — the server assigns the ledger id itself and
only stores a tx hash that is a real 64-hex `0x` value or a demo
`0xDEMO…` value. Client `transactionId` and labels are ignored so a crafted
payload cannot overwrite the landlord settlement row.

The book write is correct: confirmed → payment request paid, receivable
received, one collection, one automatic holder distribution. There is no
second write path. `applyPaymentOutcome()` is the only book-write helper —
the live path calls it after on-chain verification passes, never before.

### Which flow, which step, what you hook

#### Flow A — Renter pays rent (Merkado Pay)

This is the only flow that needs a live wallet and USDC transfer.

| Step | What the user sees | What happens now (mock) | Live mode (when switched on) |
|---|---|---|---|
| 1. Open Pay | Hub → Merkado Pay, or `/pay` | Loads the next unpaid request for the demo renter | Same |
| 2. Deep link | `/pay/payreq-mra-001-202609` | Shows 1,800.00 USDC, $1,800.00 rent, selected network, mock receiving address | Same, with the approved EOA `0x1726cf86…4f6` as the receiving address |
| 3a. Copy and send | Copy address + **I’ve sent this payment** | `reportExternalTransfer`, then pending → confirmed | **Disabled.** Copy-address confirmation is not supported in live mode |
| 3b. Connect wallet | **Connect wallet** | Mock address, selected `chainId` | **Privy external-wallet login.** Wallet must be on OP Sepolia; anything else is rejected |
| 4. Confirm | **Pay with demo wallet** | Mock submit, then pending → confirmed | viem `transfer` of native USDC for `expectedAtomicAmount` to the receiving EOA |
| 5. Submitted | “Payment submitted” | Book status `pending` | The client polls the server; the book stays `pending` until on-chain verification passes |
| 6. Confirmed | “Rent paid” | Book writes collection + holder distribution once | `verifyLivePaymentAction` verifies receipt + Transfer event + exact amount + **5-block** depth, then confirms via `applyPaymentOutcome()` |
| 7. Revisit | Same page stays paid | Idempotent. Second confirm does nothing | Same — the idempotent helper prevents double-writes |
| 8. Later month | November while September is open | Page says pay the earlier month first | Same. Do not allow a transfer for a blocked month |
| 9. Failed / wrong amount | Demo outcome menu, or your error | Book `failed` or `partial` | Wallet reject, revert, and amount mismatch map to `failed`/`pending`; the demo outcome menu is hidden in live mode |
| 10. Unknown link | Friendly not-found | No other payment data leaked | Same — keep that privacy wall |

Do **not** treat the first click as a confirmed chain receipt. Keep
submitted / pending / confirmed distinct. Only the server can confirm a live
payment, and only after the on-chain checks pass.

#### Flow B — My Payments (inside Merkado Pay)

| Step | What the user sees | Your work |
|---|---|---|
| Open Pay | This month’s payment link | Same as Flow A |
| Pay → My Payments | Next 1,800.00 USDC on the selected network | None. It reads the book Pay already wrote |
| Pay rent | Opens the matching Pay deep link | Same as Flow A |
| History | Paid / open / upcoming months | None |

#### Flow C — Landlord (Merkado Direct)

No wallet. No USDC.

| Step | Screen | Your work |
|---|---|---|
| Quote | Get Now | None. Money is USD |
| Save draft | Create Offer | None |
| See settlement | Offer detail MRA-001 | Optional explorer link only if a **real** tx hash exists |
| Record collection | Offer detail → Lab controls | None. This is the off-chain fallback, same book helper |

#### Flow D — Holder (Marketplace + Portfolio)

No subscribe. No Claim. No holder wallet in this demo.

| Step | Screen | Your work |
|---|---|---|
| Browse | Marketplace | None |
| See a collection after Pay | Portfolio `pos-mra-001` | After a **real** distribution tx exists, store that hash. Explorer link then appears |

Automatic distribution in this demo is the **intended outcome** (collection
becomes distributed) inside the demo book. There is no authorised Safe module
and no real holder-payout execution. The production design for holder
payouts is still open (see **Decisions you still own**).

### Inputs already on the payment request

Use these. Do not invent a second amount. Do not hard-code a chain.

- `paymentRequestId`
- `offerReference` (example `MRA-001`)
- `receivableId`
- `amountUsdcAtomic` (example `1800000000`)
- `receivingAddress` (the approved EOA `0x1726cf86DA996BC4B2F393E713f6F8ef83f2e4f6`)
- `paymentReference` (human only)
- `dueDate` / `periodLabel`
- `cryptoConfig.networkKey` (`op-sepolia` for the live MVP)
- `cryptoConfig.chainId`
- `cryptoConfig.usdcContract`
- `cryptoConfig.explorerBaseUrl`

### Decisions you still own

1. **Allocation.** A plain USDC transfer to one shared EOA has no reliable
   memo. The on-screen reference will not appear in the transfer. Production
   must use payment-contract calldata, unique deposit addresses, or another
   verified matching design. Matching only amount and time is not enough.
2. **Real receiving wallet.** The receiving address is a **mock EOA** today.
   Before any real money, decide who controls that EOA and how receipts are
   secured. If a Safe (or a foundation account) is ever used instead, that
   is a new, separately approved decision.
3. **Safe/executor design for holder payouts.** Threshold confirmations, a
   module, a backend relayer, or batching — pick one and get it approved. Do
   not describe any wallet as escrow or custody without counsel.
4. **Confirmation depth.** The MVP uses **5 blocks** (`LIVE_CONFIRMATION_BLOCKS`).
   Confirm this is right for the Product Lead before real money is involved.
5. **RPC provider.** The temporary public OP Sepolia RPC
   (`https://sepolia.optimism.io`) must be replaced with the Product
   Lead-supplied RPC. No key is committed.

### What you must not do

- Do not enable embedded Privy wallets. External wallets only.
- Do not hard-code one chain. Read `cryptoConfig`. The live verifier accepts
  **OP Sepolia only**.
- Do not send USDC.e or USDbC.
- Do not send mainnet USDC while a testnet is selected. Mainnet is off.
- Do not use a real Safe or claim Safe/custody/escrow behaviour. The
  receiving address is a mock EOA.
- Do not touch production Supabase `jkrfyvukhhsapoivntms`.
- Do not rewrite `applyPaymentOutcome` idempotency.
- Do not show fee, purchase price, or holder economics on Pay.
- Do not treat this instrument as a token, NFT, or transferable position.
- Do not link demo `0xDEMO…` hashes on the explorer.
- Do not flip `PAYMENT_RAIL_MODE` to `"live"` before the live testnet
  walkthrough is verified end-to-end.

### Flip the mock labels when the rail is live

The UI is wired so mocked wording does **not** have to be hunted down by
hand. The live adapter already exists; the single switch is in
`src/lib/pay/mode.ts`:

1. Open `src/lib/pay/mode.ts`.
2. Set `PAYMENT_RAIL_MODE` from `"mock"` to `"live"`.

Do this only after the live testnet walkthrough is verified end-to-end.

That single switch updates:

| Surface | Mock copy (today) | Live copy (after the flip) |
|---|---|---|
| Overview banner | Wallet and USDC payments are mocked | Pay sends USDC on the selected network |
| Overview Pay card | Demo only — nothing real is sent | Pays in USDC on the selected network |
| Payment network help | Luis uses this when he connects a real wallet | Choose the network Pay uses |
| Payment network body | The demo wallet still does not send real money | A connected wallet sends USDC on this network |
| Pay button | Pay with demo wallet | Pay with wallet |
| Connected line | Demo wallet connected | Wallet connected |
| USDC tip | Nothing real is sent | Amount matches rent one-to-one |
| Network tip | Nothing real is sent in this walkthrough | Settles on the selected network (testnet named) |
| Footer note | Demo only. This walkthrough does not send a real transfer | Testnet: this sends test USDC, not mainnet money. Mainnet: this sends real USDC |
| Demo outcomes menu | Visible (Success / Failed / Incorrect amount) | Hidden |
| Ledger from / to | Renter demo wallet / Demo receiving address | Renter wallet / Mock receiving EOA |

Do **not** flip the switch before the live walkthrough is verified. A live
label on an unverified flow is worse than an honest mock label.

If you add new Pay strings, put the mock default in `payerCopy` and the
live override in `applyPaymentRailCopy` (`src/lib/rent-advance/copy.ts`).

### Pay UI (already wired)

`src/app/pay/pay-app.tsx` already stops trusting the browser for live mode:

1. Live: `submitPayment` through the Privy-connected wallet, then poll
   `verifyLivePaymentAction(paymentRequestId, txHash)` until the server
   reports verified (or failed), and `router.refresh()` on success.
2. Mock: `submitPayment` or `reportExternalTransfer` →
   `confirmPaymentAction(id, "pending")` → wait 1.4 s →
   `confirmPaymentAction(id, "confirmed")`. This mock auto-confirm is not
   used when the rail is live.

In live mode:

- The client keeps the UI `pending` until **your server** has verified the
  USDC transfer on OP Sepolia (receipt + exact amount + **5-block** depth).
- Only the server writes the book as confirmed, with the real 64-hex
  `txHash`, through `applyPaymentOutcome()`.
- The client cannot mark rent paid because a wallet popup closed.
- The demo outcome menu and the copy-address button are hidden when the rail
  is live.
- The receiving address is the mock EOA `0x1726cf86DA996BC4B2F393E713f6F8ef83f2e4f6`.
- A chain switch is prompted/rejected when the wallet `chainId` is not
  `cryptoConfig.chainId` (OP Sepolia).

### Suggested implementation order (after approval — now mostly done)

The foundation is implemented. Remaining steps:

1. Verify the selected **OP Sepolia** testnet, native USDC, and the mock
   receiving EOA together in a real walkthrough.
2. Run the Product Lead testnet UAT (`docs/11-testing-and-uat.md`) and keep
   `PAYMENT_RAIL_MODE` on `"mock"` until it passes.
3. After Product Lead sign-off, flip `PAYMENT_RAIL_MODE` to `"live"`.
4. Connect an external wallet via Privy → ensure it is on OP Sepolia →
   USDC `transfer` for `expectedAtomicAmount` to the receiving EOA.
5. Confirm on the **server** from chain data (receipt + Transfer event +
   exact amount + **5-block** depth), then write the book.
6. Only then show explorer links for real hashes.
7. Separately design allocation and holder-distribution execution.
8. Only after a testnet walkthrough works, ask to move to OP Mainnet or
   Base Mainnet. Mainnet stays off until then.

Useful references: Circle USDC contract addresses, Circle USDC faucet,
Privy external wallet docs, viem docs.

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
| Privy app | **Developer/owner on the Kolektivo Privy app** | The public App ID (`NEXT_PUBLIC_PRIVY_APP_ID`) enables external-wallet login. No embedded wallets. |
| RPC (later) | A Product Lead-supplied Labs-only RPC key | Replaces the temporary public `https://sepolia.optimism.io` for the server verifier. Not required to start. |
| Circle faucet | None. Public. | Test USDC: https://faucet.circle.com |

**Never:**

- Production Supabase `jkrfyvukhhsapoivntms` / merkado-curaçao
- Production Vercel / merkado.cw deploy
- GitHub admin on the Kolektivo org
- Supabase Owner on Labs (Developer is enough)
- A mainnet wallet that already holds real USDC
- Service-role or host password in the repo, a ticket, or chat history

Expected later env names (add only when the adapter needs them; do not
commit values):

- `NEXT_PUBLIC_PRIVY_APP_ID` — public App ID, already a placeholder in
  `.env.example`
- Server-only RPC URL, when the Product Lead supplies the specific RPC
- Optional explorer API key if you watch transfers from the server

### Done when

- Renter can connect an external wallet via Privy on **OP Sepolia**, send
  **1,800.00** native USDC to the mock receiving EOA, and see **Rent paid**
  only after the server verifies the chain (receipt + Transfer event +
  exact amount + **5-block** depth).
- The same confirmation updates My Payments, offer MRA-001, and
  Portfolio `pos-mra-001` **once**.
- `PAYMENT_RAIL_MODE` is `"live"` only after the Product Lead walkthrough
  passes; copy no longer says demo wallet / nothing real is sent.
- Explorer links open only for real 64-hex hashes.
- Copy-address confirmation is disabled in live mode; only wallet-based
  payment confirms.
- Base Sepolia and mainnet are not live-verifiable; mainnet stays off.
- Allocation and holder-payout execution are written up, even if not
  built yet.

### Data ownership and privacy

- Allowed Supabase: Labs `csaefdkpwukshtouyixg` only.
- Forbidden: production `jkrfyvukhhsapoivntms`.
- The mock receiving EOA must stay obviously labelled as a mock address
  until the Product Lead approves a real receiving wallet.
- Production payment links will need opaque, scoped, expiring
  authorization. Demo IDs are fictional and not a security model.
- Service-role stays server-only.
- If Labs persistence is unavailable, do not report a successful saved
  payment.
- Live confirmation happens on the server from chain data. The client
  cannot mark a live payment confirmed.
