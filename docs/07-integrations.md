# 07 - Integrations

**Purpose:** What this Labs demo connects to, and the crypto architecture handoff.
**Last updated:** August 21, 2026 (Base Sepolia transferable NFT rent offer; ADR-0008)

## Live

| System | Use |
|---|---|
| Labs Supabase `csaefdkpwukshtouyixg` | Demo book, chain store, RLS, service-role server access |
| Base Sepolia (`sepolia.base.org`) | Read-only RPC for the server to read receipts and events |
| Injected wallet (EIP-1193) | Holder purchase and `claimRent`; renter `depositRent` (WalletConnect / Privy later) |

## Not in this repo

| System | Where it lives now |
|---|---|
| Listing scrapers / pipeline / Terra | merkado-cw |
| Production Auth / merkado.cw storefront | merkado-cw |
| OpenAI enrichment | not used in Labs |
| Deployed `MerkadoRentOfferV1` | **Not deployed.** Contract deployment is a separate gate. |
| Vercel production deploy | not authorised from this repo |

## Configuration

Surfaces show a quiet **not configured** state until the contract address is set.

| Name | Value / if empty |
|---|---|
| `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` | Base Sepolia deployed address. **Empty until deployment** → surfaces show not-configured. |
| `NEXT_PUBLIC_MERKADO_COMPANY_SAFE` | Defaults to the verified Safe `0xfC6ec9718d89d4935594E7DB78399913071FcDc4` |
| `MERKADO_RPC_URL` | Server-only. Default `https://sepolia.base.org` |
| `NEXT_PUBLIC_MERKADO_PAY_URL` | Apps card uses `/pay` |
| `NEXT_PUBLIC_MERKADO_DIRECT_URL` | Apps card uses `/originate` |
| `NEXT_PUBLIC_PAY_NETWORK` | Demo defaults to **Base Sepolia** (`base-sepolia`) |

Allowed `NEXT_PUBLIC_PAY_NETWORK` values: `base-sepolia` now,
`base-mainnet` later. Use the full keys only. Admin shows Base Sepolia.
Base Mainnet appears only when this env is already `base-mainnet`. Reset
keeps the selected Base testnet.

Optimism keys (`op-sepolia`, `op-mainnet`) stay in the catalog if later
opted in. They are hidden in Admin until then.

Open a new tab only when the app URL value is an absolute external URL.

## Later

- Contract deployment and verification on Base Sepolia
- Applying the chain store migration
- Sending test USDC and executing Safe transactions (separate gates)
- Hosted activation of the flow
- Bank / Stichting statements as attested collection evidence
- Written counsel opinions to lift Stage 0 gates
- **Base Mainnet** after the Base Sepolia walkthrough works and the Product
  Lead approves
- Optional move of this demo toward `direct.merkado.cw` and `pay.merkado.cw`

---

## Crypto architecture (Luis / Luuk handoff)

**Send this whole file.** The product walkthrough already works with a
**walletless landlord** and a **transferable offer NFT**. Architecture
decision: ADR-0008 (supersedes ADR-0006 / ADR-0007 where they conflict).

Status on 2026-08-21: the flow is implemented locally behind configuration.
It is **not deployed, not activated, and not merged**. The earlier mock
layer — `PAYMENT_RAIL_MODE`, the mock provider, the demo wallet, the demo
outcome menu, and demo `0xDEMO…` hashes — is removed. There is no draft
PR #19 / #20 / #22 framing anymore; those drafts are superseded by this
single flow.

### Final architecture

- **One contract.** `MerkadoRentOfferV1`, a non-upgradeable ERC-721. It
  holds **pooled Circle native USDC rent**, accounted per `tokenId`. The
  pooled balance is always ≥ total deposited-but-unclaimed rent.
- **Mint.** The verified company Safe
  (`0xfC6ec9718d89d4935594E7DB78399913071FcDc4`, Base Sepolia, 2 of 3:
  Enrique, Luuk, Luis) mints **one offer NFT per approved listing**. No
  listing expiry.
- **Transferable NFT.** There is no transfer lock. The current token owner
  is the **holder**. Only the current owner can claim that token's accrued
  rent.
- **Whole-offer purchase.** Anyone buys a whole offer: the buyer pays the
  **exact purchase price directly to the locked landlord payout address**,
  and the NFT moves company Safe → buyer **atomically** in the same
  transaction. No fractional purchase.
- **Rent deposit.** The renter calls `depositRent(tokenId,
  opaquePaymentId, amount)` with the **exact monthly amount**. The app
  schedules the six-month term; the contract imposes no deposit cap. Rent
  stays in the pooled contract until the owner claims.
- **Owner claim.** The current NFT owner calls `claimRent(tokenId)` in
  Portfolio. Claim moves that token's accrued USDC from the pool to the
  owner's wallet.
- **Wallet.** Injected EIP-1193 (WalletConnect / Privy later). No mock.
- **Server verification.** The server reads the receipt, verifies the
  exact expected event (mint / purchase / transfer / deposit / claim),
  records it in the chain store tables, and writes the demo book exactly
  once. The client never marks rent paid on its own.

### Approved networks

Use `src/lib/pay/networks.ts` and `DemoBook.cryptoConfig`. Do not
hard-code a chain. Read `config.chainId` and `config.usdcContract`.

| Key | Label | Use now | Chain ID | Native USDC | Explorer |
|---|---|---|---|---|---|
| `base-sepolia` | Base Sepolia | **Now — Base testnet, live walkthrough (not yet activated)** | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `https://sepolia.basescan.org` |
| `base-mainnet` | Base Mainnet | **Later / real USDC** | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `https://basescan.org` |
| `op-sepolia` | OP Sepolia | Catalog only. Hidden in Admin unless later opted in. | 11155420 | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` | `https://sepolia-optimism.etherscan.io` |
| `op-mainnet` | OP Mainnet | Catalog only. Hidden in Admin unless later opted in. | 10 | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` | `https://optimistic.etherscan.io` |

Public RPCs (server reads receipts through `MERKADO_RPC_URL`):

- Base Sepolia: `https://sepolia.base.org` (default)
- Base: `https://mainnet.base.org` (later)
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
| Contract | `MerkadoRentOfferV1`, non-upgradeable ERC-721, pooled USDC rent per token id |
| Company Safe | Verified Base Sepolia Safe `0xfC6ec9718d89d4935594E7DB78399913071FcDc4` (2 of 3). Mints offer NFTs. `NEXT_PUBLIC_MERKADO_COMPANY_SAFE` defaults to it. |
| Contract env | `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` — empty until deployment; empty shows not-configured |
| RPC env | Server-only `MERKADO_RPC_URL`, default `https://sepolia.base.org` |
| Listing offer | **One transferable NFT per listing**, minted by the company Safe. No expiry. |
| Landlord payout | The buyer pays the **exact purchase price directly to the locked landlord payout address**. No landlord claim, no funding record, no separate payout Safe. |
| Holder purchase | Any wallet buys the whole offer; NFT moves Safe → buyer atomically. No fractions. |
| Holder claim | Current NFT owner calls `claimRent(tokenId)` in Portfolio. Transferring the NFT moves the claim right with it. |
| Renter deposit | `depositRent(tokenId, opaquePaymentId, amount)`; exact monthly amount; app schedules the six-month term, contract has no deposit cap. |
| Wallet | Injected EIP-1193. WalletConnect versus Privy is a later choice. No mock provider or demo wallet. |
| Supabase | Labs `csaefdkpwukshtouyixg` only; service-role server-only; RLS on. |

MRA-001 locked Pay request:

- ID: `payreq-mra-001-202609`
- Period: September 2026
- Rent: **$1,800.00**
- Amount to send: **1,800.00 USDC** (`1800000000`)
- Human reference: `MRA-001-01` (the on-chain reference is the opaque
  payment id, not the human reference)

### What you implement

| Piece | Path | Your action |
|---|---|---|
| Contract | `contracts/` | `MerkadoRentOfferV1` (ERC-721). Deploy/verify scripts. Not deployed yet. |
| Env | `.env.example` | `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` (empty), `NEXT_PUBLIC_MERKADO_COMPANY_SAFE` (default), `MERKADO_RPC_URL` (server-only default) |
| Wallet | Injected EIP-1193 | WalletConnect / Privy adapter behind a thin interface. No mock provider. |
| Renter deposit | Pay screen | `depositRent(tokenId, opaquePaymentId, amount)`; pending → confirmed from the chain. |
| Holder purchase | Marketplace | Pay exact purchase price to the locked landlord address; NFT Safe → buyer atomic. |
| Holder claim | Portfolio | `claimRent(tokenId)`; only the current owner; verify non-owner rejection. |
| Book write / no double-pay | `src/lib/rent-advance/payment-apply.ts` | Do not rewrite. Confirm once from verified chain events. |
| Chain store | `supabase/migrations` | `ra_chain_epochs`, `ra_chain_offers`, `ra_chain_events`, `ra_rent_payment_attempts`, `ra_rent_deposit_verifications`, `ra_rent_claim_verifications`. RLS on; no `anon`/`authenticated` grants. Migration not applied yet. |
| Server save | server actions | Only verified chain events may write the book as confirmed. |

### Verification rules

- Mint: company Safe is the caller; one NFT per approved offer reference.
- Purchase: buyer paid the exact `purchasePrice` to the locked landlord
  address **and** the NFT owner changed Safe → buyer in the same tx.
- Deposit: `depositRent(tokenId, opaquePaymentId, amount)` where `amount`
  equals the exact monthly rent and the deposit belongs to the current
  payment request.
- Claim: `claimRent(tokenId)` caller is the current NFT owner.
- Reject self-transfers, wrong amounts, wrong network (`cryptoConfig.chainId`
  must match), duplicate confirmations, and non-owner calls.
- Explorer links open only for a real 64-hex hash on an official catalog
  explorer. No demo hashes exist anymore.

### Which flow, which step, what you hook

#### Flow A — Renter pays rent (Merkado Pay)

| Step | What the user sees | What happens now | What you add |
|---|---|---|---|
| 1. Open Pay | Hub → Merkado Pay, or `/pay` | Loads the next unpaid request for the demo renter | Nothing |
| 2. Deep link | `/pay/payreq-mra-001-202609` | Shows 1,800.00 USDC, $1,800.00 rent, selected network, opaque payment id | Read the token id and amount from the offer |
| 3. Deposit | **Pay rent** | Connects the injected wallet on `cryptoConfig.chainId` | Prompt a chain switch when the wallet `chainId` differs |
| 4. Confirm | "Payment submitted" | Book status `pending` | Keep pending until the server has seen the deposit event |
| 5. Confirmed | "Rent paid" | Server verifies the deposit event, records it, and writes the book once | Only verified chain evidence marks rent paid |
| 6. Revisit | Same page stays paid | Idempotent. Second confirm does nothing | Do not send a second deposit |
| 7. Later month | November while September is open | Page says pay the earlier month first | Do not allow a deposit for a blocked month |
| 8. Failed / wrong amount | Wallet reject or server error | Book `failed` | Map reject, revert, and amount mismatch to those outcomes |
| 9. Unknown link | Friendly not-found | No other payment data leaked | Keep that privacy wall |

Do **not** treat the first click as a confirmed chain receipt. Keep
initiated / pending / confirmed distinct.

#### Flow B — My Payments (inside Merkado Pay)

| Step | What the user sees | Your work |
|---|---|---|
| Open Pay | This month's payment link | Same as Flow A |
| Pay → My Payments | Next 1,800.00 USDC on the selected network | None. It reads the book Pay already wrote |
| Pay rent | Opens the matching Pay deep link | Same as Flow A |
| History | Paid / open / upcoming months | None |

#### Flow C — Landlord (Merkado Direct)

No landlord wallet. Merkado does the on-chain work.

| Step | Screen | Your work |
|---|---|---|
| Choose payout | Create Offer → Payout | Lock the landlord payout address before submission |
| Request offer | Create Offer | No wallet for the landlord. After Admin approval, **your system** mints the NFT from the company Safe |
| List | Admin approval | Mint via Safe. No expiry. Reject purchase if the contract env is empty (not-configured state) |
| Sale | Whole-offer purchase | Buyer pays the exact purchase price to the locked landlord address; NFT Safe → buyer atomic. Fee already included |
| See payout | My Offers / offer detail | Show Waiting / Processing / Paid. No landlord claim button. Explorer link only if a **real** tx hash exists |
| Record collection | Admin offer → Record collection | Off-chain fallback. Does not pay the landlord again |

#### Flow D — Holder (Marketplace + Portfolio)

| Step | Screen | Your work |
|---|---|---|
| Connect | Marketplace and Portfolio | Injected wallet on the selected network; verify ownership and network |
| Buy | Marketplace | Buyer purchases 100% of the offer; NFT moves Safe → buyer atomically |
| Rent arrives | Merkado Pay | Renter `depositRent` on the offer token id |
| Claim rent | Portfolio | Current NFT owner calls `claimRent(tokenId)`; non-owners rejected |
| Transfer | Portfolio / wallet | NFT is transferable; the new owner becomes the holder and can claim |

### Inputs already on the payment request

Use these. Do not invent a second amount. Do not hard-code a chain.

- `paymentRequestId`
- `offerReference` (example `MRA-001`)
- `receivableId`
- `amountUsdcAtomic` (example `1800000000`)
- `opaquePaymentId` (unique per deposit)
- `tokenId` (the offer NFT)
- `paymentReference` (human only)
- `dueDate` / `periodLabel`
- `cryptoConfig.networkKey` (`base-sepolia` by default)
- `cryptoConfig.chainId`
- `cryptoConfig.usdcContract`
- `cryptoConfig.explorerBaseUrl`
- `cryptoConfig.contractAddress` (from `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS`)

### Decisions you still own

1. **Deployment.** Deploy and verify `MerkadoRentOfferV1` on Base Sepolia,
   then set `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS`. Apply the chain store
   migration. Send test USDC and execute a Safe mint only after approval.
2. **Safe mint execution.** Confirm how the company Safe signs the mint
   (Safe Transaction Service, a relayer, or another approved design). It
   must not reduce the landlord below the purchase price shown.
3. **Fee settlement.** How the company fee is realised. It is informational
   in the demo and must never be deducted from the landlord payout.
4. **How many confirmations** before the Pay UI may say Rent paid.
5. **Wallet onboarding.** WalletConnect, Privy, or both, including network
   switching, session expiry, and account changes.
6. **Payment partners.** Girasol and Sentoo stay later; confirm contracts,
   fees, KYC/consent, and data ownership before any fiat rail.

### What you must not do

- Do not install a wallet/Safe SDK that changes the approved flow without
  the Product Lead's say-so.
- Do not hard-code one chain. Read `cryptoConfig`.
- Do not send USDC.e or USDbC.
- Do not send mainnet USDC while a testnet is selected.
- Do not touch production Supabase `jkrfyvukhhsapoivntms`.
- Do not rewrite the idempotent book write. Confirm once from verified
  chain events.
- Do not show fee, purchase price, or holder economics on Pay.
- Do not treat this as a public token market. Merkado mints the offer NFT,
  then the buyer holds it. Merkado does not custody monthly rent.
- Do not link demo hashes on the explorer. There are no demo hashes left.
- Do not claim the flow is deployed or activated until the gates close.

### Done when

- `MerkadoRentOfferV1` is deployed and verified on **Base Sepolia** and the
  env address is set.
- The company Safe mints one offer NFT per approved listing.
- A connected holder buys a whole offer (pays the landlord address; NFT
  Safe → buyer atomic) on **Base Sepolia**.
- The renter deposits **1,800.00** native USDC via `depositRent` and sees
  **Rent paid** only after the server verifies the event.
- The current NFT owner claims the token's rent in Portfolio; a non-owner is
  rejected; wrong-network calls are rejected.
- The same confirmation updates My Payments, offer MRA-001, and
  Portfolio `pos-mra-001` **once**.
- Explorer links open only for real 64-hex hashes.
- Mainnet stays off unless the Product Lead turns on **Base Mainnet**.

### Data ownership and privacy

- Allowed Supabase: Labs `csaefdkpwukshtouyixg` only.
- Forbidden: production `jkrfyvukhhsapoivntms`.
- On-chain wallet addresses and payout amounts are public once active;
  tenant and property identity stay off-chain.
- Service-role stays server-only.
- If Labs persistence is unavailable, do not report a successful saved
  payment.