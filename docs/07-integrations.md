# 07 - Integrations

**Purpose:** What this Labs demo connects to, and the crypto developer handoff.
**Last updated:** August 19, 2026

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
| `NEXT_PUBLIC_PAY_NETWORK` | Demo defaults to **OP Sepolia** (`op-sepolia`) |

Allowed `NEXT_PUBLIC_PAY_NETWORK` values: `op-sepolia`, `base-sepolia`,
`op-mainnet`, `base-mainnet`. Use the full keys only. Overview can switch
the two testnets. Mainnet choices appear only when this env is already a
mainnet. Reset keeps the selected test network.

Open a new tab only when the app URL value is an absolute external URL.

## Later

- Bank / Stichting statements as attested collection evidence
- Written counsel opinions to lift Stage 0 gates
- Real wallet connection and native USDC transfer on a testnet first,
  then OP Mainnet or Base Mainnet when approved
- Optional move of this demo toward `direct.merkado.cw` and `pay.merkado.cw`

---

## Crypto developer handoff (Luis / Luuk)

Send this whole section. The product walkthrough already works. One
confirmed rent payment already updates My Payments, the offer, and
Portfolio **once**. The only missing piece is a real Web3 adapter behind
the existing Pay interface.

**Do not install a wallet or Safe SDK until the Product Lead approves that
integration task.** The current demo must keep working without a real
wallet, RPC, or on-chain write.

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

Your job is to make the same buttons talk to **native USDC on the selected
network**, without rewriting pricing, offers, collections, or the demo
book rules. Start on a testnet.

### Approved networks

Use `src/lib/pay/networks.ts` and `DemoBook.cryptoConfig`. Do not
hard-code a chain. Read `config.chainId` and `config.usdcContract`.

| Key | Label | Use now | Chain ID | Native USDC | Explorer |
|---|---|---|---|---|---|
| `op-sepolia` | OP Sepolia | **Default testnet** (Optimism / OP Mainnet test network) | 11155420 | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` | `https://sepolia-optimism.etherscan.io` |
| `base-sepolia` | Base Sepolia | **Optional testnet** | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `https://sepolia.basescan.org` |
| `op-mainnet` | OP Mainnet | Later / real USDC | 10 | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` | `https://optimistic.etherscan.io` |
| `base-mainnet` | Base Mainnet | Later / real USDC | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `https://basescan.org` |

Public RPCs (for your adapter only; this repo does not call them):

- OP Sepolia: `https://sepolia.optimism.io`
- Base Sepolia: `https://sepolia.base.org`
- OP Mainnet: `https://mainnet.optimism.io`
- Base: `https://mainnet.base.org`

Circle testnet USDC: [faucet.circle.com](https://faucet.circle.com).
Token is always Circle **native USDC**, 6 decimals. Not USDC.e / USDbC.

Older stored books used network key `optimism` (OP Mainnet). Those rematch
to the current default testnet. An explicit `op-mainnet` or `base-mainnet`
selection is kept.

### Product decisions already made

| Topic | Decision |
|---|---|
| Network now | **OP Sepolia** default, **Base Sepolia** also available |
| Network later | OP Mainnet and Base, when the Product Lead is ready for real USDC |
| Token | Circle **native USDC** for the selected network. Not USDC.e. |
| Decimals | 6 |
| Explorer | Official explorer for the selected network — only link a real 64-hex `0x` hash |
| Customer money | **USD**. Stored as integer cents. |
| Settlement money | **USDC**, 1:1 with USD. `$1,800.00` rent = `1,800.00 USDC` = `1800000000` atomic. |
| Receiving Safe | Still a **fictional** demo address. You choose and verify the real Safe on the selected network. |
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
- `cryptoConfig.networkKey` (`op-sepolia` by default)
- `cryptoConfig.chainId`
- `cryptoConfig.usdcContract`
- `cryptoConfig.explorerBaseUrl`

### Decisions you still own

1. **Allocation.** A plain USDC transfer to one shared Safe has no reliable
   memo. The on-screen reference will not appear in the transfer. Production
   must use payment-contract calldata, unique deposit addresses, or another
   verified matching design. Matching only amount and time is not enough.
2. **Real Safe.** Create or name a Safe on the selected testnet first,
   confirm Safe services work there, and put address + id into
   `cryptoConfig`. Keep demo addresses obviously fake until then.
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

### Suggested implementation order (after approval)

1. Confirm the selected **testnet** + native USDC + Safe services together.
2. Put the real Safe address in `cryptoConfig`.
3. Implement `PaymentProvider` against `provider.ts`.
4. Switch `createPaymentProvider` to that adapter.
5. Connect wallet → switch to `cryptoConfig.chainId` → USDC `transfer`.
6. Map submitted / pending / confirmed / failed into `confirmPaymentAction`.
7. Only then show explorer links for real hashes.
8. Separately design allocation and holder-distribution execution.
9. Only after a testnet walkthrough works, ask to move to OP Mainnet or Base Mainnet.

Useful references: Circle USDC contract addresses, Circle USDC faucet,
Safe Smart Account overview, Safe Transaction Service, Safe supported
networks.

### Data ownership and privacy

- Allowed Supabase: Labs `csaefdkpwukshtouyixg` only.
- Forbidden: production `jkrfyvukhhsapoivntms`.
- Mock addresses must stay obviously fictional until replaced.
- Production payment links will need opaque, scoped, expiring
  authorization. Demo IDs are fictional and not a security model.
- Service-role stays server-only.
- If Labs persistence is unavailable, do not report a successful saved
  payment.
