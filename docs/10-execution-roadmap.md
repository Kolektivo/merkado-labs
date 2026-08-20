# 10 - Execution Roadmap

**Purpose:** Approved remaining work only.
**Last updated:** August 20, 2026 (Base Sepolia / Base Mainnet; Luis PR 19 still draft)

## Now

- Set `LABS_DEMO_PASSWORD` on the Labs Vercel Production environment,
  then approve commit and push so the host password is live on
  `merkado-labs.vercel.app`.
- **Luis** creates the **Base Sepolia** Safe receiving address. Owners are
  Enrique (`0x351a767a5Bbfe0EE9ca3aA246c2b6732Dc4e43D8`) and Luuk
  (`0x91e12A2b577Fc2823aD13bE2F9Ac746cc9e6f421`) only (**2 of 2**).
  Luis is not a signer. Testnet only. Do not use a Base Mainnet Safe.
  Send the address when it exists. Luis can still use the temporary
  receiving wallet on draft
  [PR 19](https://github.com/Kolektivo/merkado-labs/pull/19) while the
  Safe is being created.
- Stage 0 questions stay unresolved. Do not pretend they are closed.
  They are not shown on customer Home.

## Next

- Counsel opinions on M.1.2, M.1.3, M.1.4, and assignment mechanics.
- **Luis** completes an end-to-end **Base Sepolia** pay walkthrough on
  draft PR 19 (Privy external wallet, native USDC, server receipt +
  5-block check), sending test USDC to the new 2-of-2 Safe. He can use
  the temporary receiving wallet in the PR only until that Safe address
  is in the app. Do **not** merge and do **not** flip `PAYMENT_RAIL_MODE`
  to `"live"` until that walkthrough works and the Product Lead approves.
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
| Real wallet / Safe / USDC transfer | Draft PR 19 must not merge until Base Sepolia E2E + Product Lead approval; test Safe still missing from the app; allocation and holder Safe execution still open |
