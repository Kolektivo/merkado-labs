# ADR-0005 — Buildathon Direct + Pay demo

**Status:** Accepted  
**Date:** 2026-08-18

## Context

The August 2026 Labs rebuild (ADR-0004) delivered a working off-chain Rent
Advance walkthrough split into a landlord product, a holder platform, and a
one-click XCG payer page. The Buildathon needs one coherent prototype now:
Merkado Direct as the umbrella, Merkado Pay as a renter payment-link, a
Labs-only account mock, and shared fictional state — while legal, network,
Safe, and production architecture decisions stay open.

## Decision

- Treat **Merkado Direct** as the customer-facing umbrella for My Offers,
  Create Offer, Get Now, Marketplace, and Portfolio. Do not prominently
  brand a separate Merkado Rent Advance product.
- Add **Merkado Pay** as a mocked USDC-only payment-link. No real wallet
  prompt, signature, RPC, SDK, token transfer, Safe transaction, or
  blockchain write.
- Add a fictional Labs **Merkado account** (My Payments, Apps). Do not
  reuse production auth, cookies, or profiles.
- Keep one JSON `DemoBook` in `ra_demo_state` with `normalizeBook()` for
  older payloads. No new migration.
- Use deterministic stable IDs. Do not create a token, NFT, transferable
  position, or secondary market. `externalTokenId` may be null only.
- Present holder distributions as automatic in this demo. No Claim button.
- Keep the pricing engine on raw Listing Score and Payer Score. Derived
  Property Score is presentation-only.
- Expose a typed `PaymentProvider` so Luis can replace the mock adapter
  later. Network, chain ID, USDC contract, Safe, and explorer stay
  data-driven and unselected. Luis and Luuk own those choices.
- Do not connect production Supabase, users, or merkado.cw.

## Options considered

### Option A: Multi-surface Labs demo with a mock provider (chosen)

- Benefits: Explainable live walkthrough; shared state; Luis has a typed
  replacement seam; no premature network lock-in.
- Risks: Viewers may mistake mocked Pay for a real wallet. Mitigate with
  demo-only labelling and fictional addresses.
- Product impact: One story instead of three disconnected apps.
- Technical impact: JSON book extension only; no new dependency.

### Option B: Keep the isolated XCG walkthrough until legal and chain
decisions close

- Benefits: Less surface area.
- Risks: The Buildathon cannot show the intended ecosystem.
- Product impact: Fails the approved handoff.
- Technical impact: None.

### Option C: Install a real wallet/Safe stack now

- Benefits: Closer to production mechanics.
- Risks: Forces a network, usable addresses, and legal claims we cannot
  make. Forbidden by the handoff.
- Product impact: Unsafe for a public demo.
- Technical impact: New dependencies and production-adjacent secrets.

## Reason

The Product Lead approved a believable prototype now, with mocked crypto
and open legal gates, rather than waiting for chain selection or shipping
a real wallet.

## Consequences

- Positive: Direct, Pay, and account share one book; quote → offer → pay
  → portfolio is one story; Luis has a documented replacement path.
- Negative: “Automatic distribution” and payment allocation are
  demonstrated states, not production mechanics.
- Follow-up: Luis and Luuk select network, native USDC, Safe services,
  and allocation design. Counsel still owns M.1.2 / M.1.3 / M.1.4.

## Reversal or migration

Revert customer copy and hide Pay/account routes if the umbrella naming
is withdrawn. The mock provider can be deleted when a real adapter ships
in a later approved task. JSON fields remain optional via normalization.

## Relationship to ADR-0004

ADR-0004 remains accepted for removing scrapers and hosting the Labs demo
in this repository. ADR-0005 supersedes ADR-0004 only where they conflict:

- customer brand split (Rent Advance vs holder-only Direct)
- “no crypto in this demo” as a product stance (mocked USDC is now in
  scope; real crypto is still out)
- XCG-only payer page as the final renter experience

Do not rewrite ADR-0004.

## Amendment — 2026-08-19

Product Lead selected **OP Mainnet** and **USD as the default customer
currency** (USDC 1:1). The mock wallet remains. Network, native USDC
contract, and explorer are now filled in `cryptoConfig`. Luis and Luuk
still own the real adapter, Safe address, allocation, and Safe execution.
Do not treat this amendment as permission to install a wallet SDK.

## Amendment — 2026-08-20 (Base Sepolia test Safe)

Product Lead accepted **Base Sepolia** for the test receiving Safe after
Luis reported that Safe services do not support OP Sepolia. Owners are
Enrique, Luuk, and Luis, threshold **2 of 3**. Luis created the Safe and
verified it on 2026-08-20: **Safe v1.4.1, 2-of-3**, address
`0xfC6ec9718d89d4935594E7DB78399913071FcDc4`. It is set in
`cryptoConfig.safeAddress` on the PR #20 stack. The live pay walkthrough
uses Base Sepolia. Repeat the Safe setup on **Base Mainnet** only after
that testnet works. This amendment does not allow installing a wallet or
Safe SDK, merging PR 19, or flipping `PAYMENT_RAIL_MODE`.

## Amendment — 2026-08-20 (Wave 2 idempotency)

Wave 2 (`task/pr20-safe-idempotency`) backs live USDC confirmation with a
server-side verification record. `ra_payment_verifications` (migration
`20260820100000`) stores one row per on-chain transfer log
(unique `chain_id, tx_hash, log_index`) and at most one confirmed
verification per payment request. `verify.ts` matches exactly one USDC
Transfer to the verified Safe by `txHash`/`logIndex` before the
5-block confirmation check; `verifyLivePaymentAction` writes the book
once via `applyPaymentOutcome`. This stays dormant while
`PAYMENT_RAIL_MODE` is `"mock"`. It does not authorise a live transfer or
a wallet SDK.

## Amendment — 2026-08-20 (Base only)

Product Lead chose **Base Sepolia** now and **Base Mainnet** later for
both the mocked demo and the live walkthrough. Admin no longer offers
OP Sepolia. Optimism keys stay in the catalog if Luis later opts in.
This supersedes the same-day note that the mock could stay on OP
Sepolia, and the earlier OP Mainnet later-live assumption. This
amendment does not allow installing a wallet or Safe SDK, merging PR 19,
or flipping `PAYMENT_RAIL_MODE`.

## Approval

- Product Lead: approved Buildathon handoff, 2026-08-18
- Product Lead: approved OP Mainnet + USD default, 2026-08-19
- Product Lead: approved OP Sepolia + Base Sepolia now, mainnet later, 2026-08-19
- Product Lead: approved Base Sepolia test Safe (2 of 3, Enrique + Luuk + Luis), 2026-08-20
- Product Lead: approved Base Sepolia now / Base Mainnet later as the only product networks, 2026-08-20
- Technical owner: Merkado Labs agent implementation
- Date: 2026-08-18; amended 2026-08-19 and 2026-08-20

## Amendment — 2026-08-19 (testnets first)

Product Lead asked to prepare the Luis handoff on **OP Sepolia** and
**Base Sepolia**, with OP Mainnet and Base Mainnet available later. The mock
wallet remains. One confirmed Pay write still updates the shared book
once. Do not treat this amendment as permission to install a wallet SDK.

## Amendment — 2026-08-20 (landlord proceeds claim / PR #22 draft)

Product Lead superseded PR #21's split settlement-mode decision. PR #22
remains draft, stacked on PR #20 / PR #19, and is not deployed or live.
The only approved landlord sale-proceeds settlement flow is the **mocked
landlord proceeds claim**.

MRA-001, MRA-010, and every new or existing Offer use
`settlementMode: "landlord_claim"`. Legacy missing or `"automatic"` values
migrate to `"landlord_claim"` and are not retained. No Offer derives or
retains an `advance_settlement`.

- On full funding, every offer records one **OfferFundingRecord**
  (UI wording **“Mock funding recorded”**, never “Deposit confirmed
  on-chain”) and one **LandlordProceedsClaim** in `available`.
- The claim lifecycle is `available → processing → paid` (also `failed`).
  Starting a claim locks the destination EOA; retries go only to that
  locked address. `paid` is terminal and writes the mocked
  `landlord_proceeds_claim` ledger row once. `txHash` stays `null` (no
  fake chain evidence); no NFT, token, or explorer link; `externalTokenId`
  stays `null`.
- The payout destination is an **unverified demo EOA** (fictional only),
  stored server-side and never shown across privacy walls. It never
  implies wallet ownership.
- Holder **rent distributions** remain automatic. They are distinct from
  the removed automatic landlord **sale-proceeds settlement**.
- The renter payment rail and PR #20's `ra_payment_verifications`
  idempotency are untouched. PR #22 adds no wallet/Safe dependency.

This amendment does not allow installing a wallet or Safe SDK, merging PR
#19, PR #20, or PR #22, deploying any stack, or flipping
`PAYMENT_RAIL_MODE`.
