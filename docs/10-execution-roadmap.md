# 10 - Execution Roadmap

**Purpose:** Approved remaining work only.
**Last updated:** August 20, 2026 (Base Sepolia / Base Mainnet; Luis PR 19 still draft)

## Now

- Set `LABS_DEMO_PASSWORD` on the Labs Vercel Production environment,
  then approve commit and push so the host password is live on
  `merkado-labs.vercel.app`.
- **Luis** Base Sepolia Safe receiving address: **created and verified**
  (`0xfC6ec9718d89d4935594E7DB78399913071FcDc4`, Safe v1.4.1, 2 of 3,
  owners Enrique, Luuk, and Luis). It is set in `cryptoConfig.safeAddress`
  on the PR #20 stack. Testnet only. Do not use a Base Mainnet Safe.
- Stage 0 questions stay unresolved. Do not pretend they are closed.
  They are not shown on customer Home.

## Next

- Counsel opinions on M.1.2, M.1.3, M.1.4, and assignment mechanics.
- **Luis** completes an end-to-end **Base Sepolia** pay walkthrough on
  draft PR 19 (Reown AppKit external wallet, native USDC, server receipt +
  5-block check), sending test USDC to the 2-of-3 Safe. The verified Safe
  address is already in the app on the PR #20 stack. Do **not** merge and
  do **not** flip `PAYMENT_RAIL_MODE` to `"live"` until that walkthrough
  works and the Product Lead approves.
  Repeat the Safe setup on **Base Mainnet** only after this testnet works.
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
| Real wallet / Safe / USDC transfer | Draft PR 19 must not merge until Base Sepolia E2E + Product Lead approval; test Safe is verified and in the app on the PR #20 stack; allocation and holder Safe execution still open |
