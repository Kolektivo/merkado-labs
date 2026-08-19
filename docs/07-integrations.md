# 07 - Integrations

**Purpose:** What this Labs demo connects to, and the Luis crypto handoff.
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
| Real network / USDC / wallet / Safe integration | Unselected; Luis and Luuk own. Mocked only until a separately approved integration task. |
| Vercel production deploy | not authorised from this repo |

## Optional Labs configuration

These are local/demo direction only. They do not authorise deployment.

| Name | If empty |
|---|---|
| `NEXT_PUBLIC_MERKADO_PAY_URL` | Apps card uses `/pay` |
| `NEXT_PUBLIC_MERKADO_DIRECT_URL` | Apps card uses `/originate` |

Open a new tab only when the value is an absolute external URL.

## Later

- Bank / Stichting statements as attested collection evidence
- Written counsel opinions to lift Stage 0 gates
- Real wallet / Safe / native USDC on a network Luis and Luuk select
- Optional move of this demo toward `direct.merkado.cw` and `pay.merkado.cw`

---

## Luis crypto integration handoff

All wallet, Safe, USDC, transaction, and distribution behaviour remains
mocked until a separately approved Luis/Luuk integration task. Do not
install a wallet or Safe SDK before that approval.

### Adapter locations

| Piece | Path |
|---|---|
| Provider interface | `src/lib/pay/provider.ts` |
| Mock adapter (replace) | `src/lib/pay/mock-provider.ts` |
| Config / app URLs | `src/lib/pay/config.ts` |
| Book apply/idempotency | `src/lib/rent-advance/payment-apply.ts` |
| Server action | `confirmPaymentAction` in `src/lib/rent-advance/actions.ts` |
| Pay UI | `src/app/pay/` |
| Account payments UI | `src/app/account/` |

### Future provider inputs

- chain/network key and chain ID
- native USDC contract address and decimals
- Safe ID and address
- explorer base URL
- wallet connection result
- payment request ID
- offer reference and receivable ID
- payer account ID or verified payer wallet, where applicable
- expected recipient, amount in atomic units, and due date

These live on `DemoBook.cryptoConfig` and the payment request. They must
stay data-driven. Do not hard-code Base or any other network.

### Future provider outputs / statuses

- connected wallet address
- submitted transaction hash
- chain ID
- from, to, token contract, and atomic amount
- submitted, indexed, confirmed, failed, or replaced
- block number/timestamp and confirmation count when available
- Safe distribution transaction/reference and status
- normalized, user-safe error code/message

### UI state mapping

| Provider / book status | Pay UI |
|---|---|
| no session | wallet disconnected |
| connecting | connecting |
| address present | connected (truncated address) |
| `initiated` | awaiting confirmation |
| `pending` / submitted | submitted / pending |
| `confirmed` | success / already paid on revisit |
| `failed` | failed with retry |
| amount mismatch | partial or incorrect amount |
| past due, unpaid | overdue |
| unknown or expired id | friendly not-found |

Do not treat the first click as a verified blockchain receipt. Keep
initiated / pending / confirmed distinct.

### Transaction and allocation caveats (record, do not solve in the mock)

1. A plain ERC-20 transfer to one pooled Safe has **no reliable free-text
   memo**. The displayed payment reference is for humans. Production must
   choose payment-contract calldata, unique deposit addresses, or a
   carefully verified reconciliation design. Matching only amount and time
   is not robust.
2. A Safe’s transaction threshold requires confirmations before execution.
   “Automatic distribution” in this prototype is the intended **state and
   outcome**, not an authorised module. Production needs an explicitly
   approved backend, module, or batching design.
3. The chosen network must support both the selected Safe services and the
   exact native USDC contract. Luis and Luuk must select and verify these
   together.
4. Do not describe the Safe as legally neutral, custodial, or escrow
   without explicit legal review.

Useful primary references (external): Safe Smart Account overview, Safe
Transaction Service, Safe supported networks, Circle USDC contract
addresses.

### Data ownership and privacy

- Allowed Supabase: Labs `csaefdkpwukshtouyixg` only.
- Forbidden: production `jkrfyvukhhsapoivntms`.
- Mock addresses must stay obviously fictional.
- Production payment links will need opaque, scoped, expiring
  authorization. Demo IDs are fictional and not a security model.
- Service-role stays server-only.
- If Labs persistence is unavailable, do not report a successful saved
  payment.

### Exact replacement points

1. Replace `createMockPaymentProvider()` with a real adapter that
   implements `PaymentProvider`.
2. Keep Pay UI talking only to that interface.
3. Map real submitted/indexed/confirmed/failed statuses into
   `confirmPaymentAction` without changing the idempotent book helper.
4. Fill `cryptoConfig` once Luis and Luuk choose network, USDC, Safe, and
   explorer. Only then show an explorer link.
5. Leave allocation of a pooled transfer as an explicit unresolved backend
   decision.
