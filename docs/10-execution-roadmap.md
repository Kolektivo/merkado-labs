# 10 - Execution Roadmap

**Purpose:** Approved remaining work only.
**Last updated:** August 21, 2026 (Luis Wave 3 landlord proceeds)

## Now

- Product Lead reviews the **Landlord proceeds** card: local `main`
  working tree for Waiting / Available / Paid, and Luis PR #22 (local
  `http://localhost:3001` or the Vercel preview after login) for
  Processing / Failed / Retry. Do not merge.
- **Luis** finishes the deposit walkthrough and the mocked NFT /
  listing-offer flow (expected next working slice tomorrow night). Keep
  renter-payment verification in PR #20 untouched.
- **Luis** closes the final no-go audit items in `docs/07-integrations.md`:
  block mock confirmation in live mode, decode real padded ERC-20 logs,
  verify listing addresses rather than the one company Safe, keep the
  real Safe out of mock Pay, isolate real-money actions from the shared
  resettable book, and reconcile the provider hook / factory seam.
- Set `LABS_DEMO_PASSWORD` on the Labs Vercel Production environment,
  then approve commit and push so the host password is live on
  `merkado-labs.vercel.app`.
- **Luis** treats the existing Base Sepolia Safe
  `0xfC6ec9718d89d4935594E7DB78399913071FcDc4` (2 of 3) as the **company
  Safe** (create offers; live fee handling still needs confirmation).
  Create a **second** Base Sepolia
  **sales proceeds Safe**. Do not use a Base Mainnet Safe. Send both
  addresses when they exist. Draft
  [PR 19](https://github.com/Kolektivo/merkado-labs/pull/19),
  [PR 20](https://github.com/Kolektivo/merkado-labs/pull/20), and
  [PR 22](https://github.com/Kolektivo/merkado-labs/pull/22) stay unmerged.
- Send Luis the updated `docs/07-integrations.md` (one NFT per listing,
  two Safes, rent-to-listing, landlord claim, holder claim, sponsorship
  of `claim()` still for Luis to confirm).
- Stage 0 questions stay unresolved. Do not pretend they are closed.
  They are not shown on customer Home.

## Next

- Counsel opinions on M.1.2, M.1.3, M.1.4, and assignment mechanics.
- **Luis** designs the per-listing offer contract, landlord-claim send,
  and holder `claim()`, then completes an end-to-end **Base Sepolia**
  walkthrough on the draft stack (create listing offer from company Safe,
  sale into proceeds Safe, fee sweep, landlord claim, rent to listing,
  holder claim). Confirm whether holder `claim()` can be sponsored. Do
  **not** merge and do **not** flip `PAYMENT_RAIL_MODE` to `"live"` until
  that walkthrough works and the Product Lead approves.
- Luis / Finance confirm how any company-fee sweep is funded. It must not
  reduce the landlord below the purchase price shown on the approved
  offer.
- Decide production payment allocation now that rent is per-offer.
- Attested collection evidence from a real foundation sub-ledger (still no
  oracle).

## Later

- Girasol bank payout for landlord proceeds.
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
| Real wallet / Safe / USDC transfer | Draft PRs 19/20/22 must not merge until Base Sepolia E2E + Product Lead approval; two Safes + offer contract still open |
