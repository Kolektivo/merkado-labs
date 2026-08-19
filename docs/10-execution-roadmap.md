# 10 - Execution Roadmap

**Purpose:** Approved remaining work only.
**Last updated:** August 19, 2026

## Now

- Set `LABS_DEMO_PASSWORD` on the Labs Vercel Production environment,
  then approve commit and push so the host password is live on
  `merkado-labs.vercel.app`.
- Product Lead visual/product UAT of the verified Labs Buildathon demo
  (hub, Direct, Pay, and account mock) before showing Luuk.
- Keep Stage 0 questions visible; do not pretend they are closed.

## Next

- Counsel opinions on M.1.2, M.1.3, M.1.4, and assignment mechanics.
- After Product Lead approval, Luis and Luuk replace the mock provider
  with a real wallet + native USDC adapter on **OP Sepolia** or **Base
  Sepolia** first. Send `docs/07-integrations.md`. Grant access using
  `docs/12-deployment-runbook.md`. Flip `PAYMENT_RAIL_MODE` to `"live"`
  in the same change so mocked Pay labels switch off. OP Mainnet and
  Base Mainnet stay later. Safe address, allocation, and confirmation
  depth are still theirs.
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

## Blocked

| Item | Blocker |
|---|---|
| Third-party subscribe | M.1.2 |
| Real collection flow | M.1.3 |
| Public Merkado Direct page | M.1.4 |
| 3-month term origination | Separate short-dated advice |
| Real wallet / Safe / USDC transfer | Product Lead must approve the integration task; start on a testnet; allocation and Safe execution still open |
