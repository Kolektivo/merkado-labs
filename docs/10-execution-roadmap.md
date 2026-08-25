# 10 - Execution Roadmap

**Purpose:** Approved remaining work only.
**Last updated:** August 25, 2026 (display-only 60-day window, reset/new epoch, QR informational, customer statuses)

## Now

- **In progress (branch `wave6-main-ui-restore`):** the Product Lead–approved
  stacked implementation of the **display-only** 60-day listing window,
  **Reset = fresh demo book + new chain-store epoch** (chain not rolled back),
  **informational-only Pay QR / copy controls**, limited **customer statuses**
  (Paid = landlord proceeds card only; mint/NFT wording Admin-only),
  **Save draft**, and **Admin mint-state consistency**. Code is being
  implemented in parallel; verification and the `09` update follow. The fresh
  Base Sepolia contract redeploy + env address update that pairs with Reset
  remains a **separate approved operational gate**.

- Background mint sweep: `/api/cron/mint` runs on a schedule (vercel.json, every 5 min) so approved offers are minted automatically without needing an Admin page load; it also resumes broadcast-but-unverified mints.

- Product Lead reviews the Base Sepolia NFT flow: payout locked before
  submission, mint by the backend mint key, whole-offer purchase (buyer pays the
  landlord address; NFT Safe → buyer atomic), renter `depositRent`, owner
  `claimRent`, and the not-configured state while the contract env is empty.
- **Deployment gates (all still closed).** Deploy and verify
  `MerkadoRentOfferV1` on **Base Sepolia**; set
  `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS`; apply the chain store migration
  (`ra_chain_epochs`, `ra_chain_offers`, `ra_chain_events`,
  `ra_rent_payment_attempts`, `ra_rent_deposit_verifications`,
  `ra_rent_claim_verifications`); send test USDC.
  Each requires explicit Product Lead approval. Do **not** merge or activate
  the flow until each gate closes.
- Set `LABS_DEMO_PASSWORD` on the Labs Vercel Production environment,
  then approve commit and push so the host password is live on
  `merkado-labs.vercel.app`.
- **Luis** confirms `MERKADO_MINTER_PRIVATE_KEY` funding/rotation for minting
  approved relayer) and the fee settlement path. The fee is informational and
  must never reduce the landlord below the purchase price shown.
- Stage 0 questions stay unresolved. Do not pretend they are closed.
  They are not shown on customer Home.

## Next

- Counsel opinions on M.1.2, M.1.3, M.1.4, and assignment mechanics.
- **Luis** completes an end-to-end **Base Sepolia** walkthrough once
  deployed: backend mint → whole-offer purchase → renter `depositRent` → owner
  `claimRent` → NFT transfer to a new owner and claim as the new owner.
  Do **not** merge and do **not** activate hosted flows until that
  walkthrough works and the Product Lead approves.
- Confirm company fee settlement without reducing the landlord payout.
- Attested collection evidence from a real foundation sub-ledger (still no
  oracle).

## Later

- **Base Mainnet** after the Base Sepolia walkthrough works and the Product
  Lead turns it on.
- Girasol bank payout for landlord proceeds after commercial/API/KYC approval.
- Sentoo renter bank payment after consent, callback, reconciliation, and
  bank-data handling approval.
- Product Lead chooses WalletConnect, Privy, or both for production holder
  onboarding after the technical recommendation.
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
| Contract deployment | Not approved; `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` empty |
| Chain store migration | Not approved / not applied |
| Test USDC + live mint | Not approved; requires contract deployed |
| Hosted activation / merge | Product Lead approval after the Base Sepolia E2E |
| Base Mainnet / real funds | Explicitly blocked; testnet only |
