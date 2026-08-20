# 10 - Execution Roadmap

**Purpose:** Approved remaining work only.
**Last updated:** August 19, 2026 (approved OP Sepolia Web3 MVP)

## Now

- Verify the approved **OP Sepolia Web3 MVP** end-to-end on a testnet:
  connect an external wallet via Privy, send 1,800.00 USDC to the mock
  receiving EOA, and see Rent paid only after the server verifies the chain
  (receipt + Transfer event + exact amount + **5-block** depth). Keep
  `PAYMENT_RAIL_MODE` on `"mock"` until this passes.
- After the verified walkthrough, flip `PAYMENT_RAIL_MODE` to `"live"` and
  update `docs/09-current-state.md` (it must not claim the Web3 flow is live
  before then).
- Set `LABS_DEMO_PASSWORD` on the Labs Vercel Production environment,
  then approve commit and push so the host password is live on
  `merkado-labs.vercel.app`.
- Product Lead visual/product UAT of the verified Labs Buildathon demo
  (hub, Direct, Pay, and account mock) before showing Luuk.
- Keep Stage 0 questions visible; do not pretend they are closed.

## Next

- Counsel opinions on M.1.2, M.1.3, M.1.4, and assignment mechanics.
- Replace the temporary public OP Sepolia RPC with the Product
  Lead-supplied RPC. No key is committed.
- Decide production payment allocation (calldata, unique deposit addresses,
  or another verified design). A plain USDC memo is not reliable.
- Attested collection evidence from a real foundation sub-ledger (still no
  oracle).

## Later

- Merkado Direct · Property series (not authorised to start).
- Third-party holders after written opinions.
- Production Auth and merkado.cw embedding.
- Public hosts such as `direct.merkado.cw` and `pay.merkado.cw` after an
  explicit deploy instruction.
- OP Mainnet / Base Mainnet live payments, only after the Product Lead
  approves and turns them on.

## Blocked

| Item | Blocker |
|---|---|
| Third-party subscribe | M.1.2 |
| Real collection flow | M.1.3 |
| Public Merkado Direct page | M.1.4 |
| 3-month term origination | Separate short-dated advice |
| Live Web3 flow declared verified | A real OP Sepolia testnet walkthrough (connect, send, 5-block confirm) is not completed yet |
| Production allocation | How a pooled USDC transfer maps to a payment request |
| Holder-payout execution (Safe/executor design) | Not approved; no Safe SDK or holder payout in this MVP |
| Mainnet live payments | Product Lead approval; testnet walkthrough first |
