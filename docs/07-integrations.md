# 07 - Integrations

**Purpose:** What this Labs demo connects to, and the crypto developer handoff.
**Last updated:** August 20, 2026 (Base Sepolia / Base Mainnet)

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
- Optional move of this demo toward `direct.merkado.cw` and `pay.merkado.cw`

---

## Crypto developer handoff (Luis / Luuk)

**Send this whole file.** The product walkthrough already works. One
confirmed rent payment already updates My Payments, the offer, and
Portfolio **once**. The only missing piece is a real Web3 adapter behind
the existing Pay interface, plus flipping the mock labels when that
adapter is live.

**Do not install a wallet or Safe SDK until the Product Lead approves that
integration task.** The current demo must keep working without a real
wallet, RPC, or on-chain write.

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
| `base-sepolia` | Base Sepolia | **Now — Base testnet, test Safe, live walkthrough** | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `https://sepolia.basescan.org` |
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
| Test Safe | Create on **Base Sepolia**. Threshold **2 of 3**. Owners: Enrique `0x351a767a5Bbfe0EE9ca3aA246c2b6732Dc4e43D8`, Luuk `0x91e12A2b577Fc2823aD13bE2F9Ac746cc9e6f421`, and Luis (as discussed). |
| Receiving Safe | Still a **fictional** demo address in the app. After you send the Base Sepolia Safe address and the Product Lead confirms it, put it in `cryptoConfig`. |
| Wallet in this repo | Mocked. No SDK installed. |

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
| Network / USDC / explorer facts | `src/lib/pay/networks.ts` and `DemoBook.cryptoConfig` | Fill the real Safe address here when you have it |
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
receivable received, one collection, one automatic holder distribution.
Do not add a second write path.

Do **not** reuse `confirmPaymentAction` as the live confirmation API.
When Pay goes live, confirm on the server from chain data, then write
the book.

### Which flow, which step, what you hook

#### Flow A — Renter pays rent (Merkado Pay)

This is the only flow that needs a live wallet and USDC transfer.

| Step | What the user sees | What happens now | What you add |
|---|---|---|---|
| 1. Open Pay | Hub → Merkado Pay, or `/pay` | Loads the next unpaid request for the demo renter | Nothing |
| 2. Deep link | `/pay/payreq-mra-001-202609` | Shows 1,800.00 USDC, $1,800.00 rent, selected network, fictional receiving address | Show the real Safe address from `cryptoConfig.safeAddress` once you set it |
| 3a. Copy and send | Copy address + **I’ve sent this payment** | `reportExternalTransfer`, then pending → confirmed | Watch the Safe for an inbound native USDC transfer of `expectedAtomicAmount` and match it to this request |
| 3b. Connect wallet | **Connect wallet** | Mock address, selected `chainId` | Real wallet on the selected network. Reject or prompt switch if `chainId` does not match `cryptoConfig.chainId` |
| 4. Confirm | **Pay with demo wallet** | Mock submit, then pending → confirmed | `transfer` native USDC for `expectedAtomicAmount` to `recipient` |
| 5. Submitted | “Payment submitted” | Book status `pending` | Keep pending until the tx is indexed |
| 6. Confirmed | “Rent paid” | Book writes collection + holder distribution once | Call `confirmPaymentAction(id, "confirmed", { txHash })` only after you consider it confirmed |
| 7. Revisit | Same page stays paid | Idempotent. Second confirm does nothing | Do not send a second transfer |
| 8. Later month | November while September is open | Page says pay the earlier month first | Do not allow a transfer for a blocked month |
| 9. Failed / wrong amount | Demo outcome menu, or your error | Book `failed` or `partial` | Map wallet reject, revert, and amount mismatch to those outcomes |
| 10. Unknown link | Friendly not-found | No other payment data leaked | Keep that privacy wall |

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

No wallet. No USDC.

| Step | Screen | Your work |
|---|---|---|
| Quote | Simulator | None. Book stores USD; UI shows XCG at 1.79 |
| Save draft | Create Offer | None |
| See settlement | Offer detail MRA-001 | Optional explorer link only if a **real** tx hash exists |
| Record collection | Admin offer → Record collection | None. This is the off-chain fallback, same book helper |

#### Flow D — Holder (Marketplace + Portfolio)

No subscribe. No Claim. No holder wallet in this demo.

| Step | Screen | Your work |
|---|---|---|
| Browse | Marketplace | None |
| See a collection after Pay | Portfolio `pos-mra-001` | After a **real** distribution tx exists, store that hash. Explorer link then appears |

Automatic distribution in this demo is the **intended outcome** (collection
becomes distributed). It is not an authorised Safe module. You still owe
the production design for how the Safe actually pays holders.

### Inputs already on the payment request

Use these. Do not invent a second amount. Do not hard-code a chain.

- `paymentRequestId`
- `offerReference` (example `MRA-001`)
- `receivableId`
- `amountUsdcAtomic` (example `1800000000`)
- `receivingAddress` (today fictional; replace via `cryptoConfig.safeAddress`)
- `paymentReference` (human only)
- `dueDate` / `periodLabel`
- `cryptoConfig.networkKey` (`base-sepolia` by default)
- `cryptoConfig.chainId`
- `cryptoConfig.usdcContract`
- `cryptoConfig.explorerBaseUrl`

### Decisions you still own

1. **Allocation.** A plain USDC transfer to one shared Safe has no reliable
   memo. The on-screen reference will not appear in the transfer. Production
   must use payment-contract calldata, unique deposit addresses, or another
   verified matching design. Matching only amount and time is not enough.
2. **Real Safe.** Create the 2-of-3 Safe on **Base Sepolia** with Enrique,
   Luuk, and Luis as the owners. Confirm Safe services work there. Send
   the address to the Product Lead. Put address + id into `cryptoConfig`
   only after that confirmation. Keep demo addresses obviously fake until
   then. Do not create this test Safe on Base Mainnet.
3. **Safe execution for holder payouts.** Threshold confirmations, a module,
   a backend relayer, or batching — pick one and get it approved. Do not
   describe the Safe as escrow or custody without counsel.
4. **How many confirmations** before the Pay UI may say Rent paid.

### What you must not do

- Do not install a wallet/Safe SDK until the Product Lead says so.
- Do not hard-code one chain. Read `cryptoConfig`.
- Do not send USDC.e or USDbC.
- Do not send mainnet USDC while a testnet is selected.
- Do not touch production Supabase `jkrfyvukhhsapoivntms`.
- Do not rewrite `applyPaymentOutcome` idempotency.
- Do not show fee, purchase price, or holder economics on Pay.
- Do not treat this instrument as a token, NFT, or transferable position.
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
| Pay button | Pay with demo wallet | Pay with wallet |
| Connected line | Demo wallet connected | Wallet connected |
| USDC tip | Nothing real is sent | Amount matches rent one-to-one |
| Network tip | Nothing real is sent in this walkthrough | Settles on the selected network (testnet named) |
| Footer note | Demo only. This walkthrough does not send a real transfer | Testnet: this sends test USDC, not mainnet money. Mainnet: this sends real USDC |
| Demo outcomes menu | Visible (Success / Failed / Incorrect amount) | Hidden |
| Ledger from / to | Renter demo wallet / Demo receiving address | Renter wallet / Receiving Safe |

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
- Replace the fictional Safe (`0xDEMO0000SAFE00…`) in `cryptoConfig.safeAddress`.
- Prompt a chain switch when the wallet `chainId` is not
  `cryptoConfig.chainId`.

### Suggested implementation order (after approval)

1. Confirm **Base Sepolia** + native USDC + Safe services together.
2. Put the real Safe address in `cryptoConfig`.
3. Implement `PaymentProvider` against `provider.ts`.
4. Switch `createPaymentProvider` to that adapter.
5. Flip `PAYMENT_RAIL_MODE` to `"live"` in the same change.
6. Connect wallet → switch to `cryptoConfig.chainId` → USDC `transfer`.
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
| Safe{Wallet} | Create a **Base Sepolia** Safe. | Receiving address for Pay. Owners are Enrique, Luuk, and Luis (**2 of 3**). |
| Reown / WalletConnect Cloud | A project you create or are invited to | Wallet connect project ID for the adapter. |
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

- Renter can connect a real wallet on **Base Sepolia**, send **1,800.00**
  native USDC to the real 2-of-3 Safe, and see **Rent paid** only after
  the chain confirms it.
- The same confirmation updates My Payments, offer MRA-001, and
  Portfolio `pos-mra-001` **once**.
- Copy no longer says demo wallet / nothing real is sent (`PAYMENT_RAIL_MODE`
  is `"live"`).
- Explorer links open only for real 64-hex hashes.
- Copy-address path still works by watching the Safe, not by trusting
  the renter’s click.
- Mainnet stays off unless the Product Lead turns on **Base Mainnet**.
- Allocation and holder Safe execution are written up, even if not
  built yet.

### Data ownership and privacy

- Allowed Supabase: Labs `csaefdkpwukshtouyixg` only.
- Forbidden: production `jkrfyvukhhsapoivntms`.
- Mock addresses must stay obviously fictional until replaced.
- Production payment links will need opaque, scoped, expiring
  authorization. Demo IDs are fictional and not a security model.
- Service-role stays server-only.
- If Labs persistence is unavailable, do not report a successful saved
  payment.
