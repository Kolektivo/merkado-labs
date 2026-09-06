# 10 - Execution Roadmap

**Purpose:** Approved remaining work only.
**Last updated:** September 6, 2026 (Optimism Mainnet deployment and app cutover)

## Now

- **Labs Auth and shared demo state (branch `feat/labs-auth-accounts`):** email
  magic links are the first-party sign-in path, with identity-only Supabase
  OAuth authorization supported through `/oauth/consent`. All users share one
  demo book, while each account has one linked wallet. The account/wallet migration and
  atomic wallet-link follow-on are applied to the approved Labs branch; hosted
  activation and merging remain blocked.

- **Admin authorization:** Admin pages, navigation, and mutations use the
  server-side `ADMIN_EMAILS` allowlist and fail closed when configured. No
  wallet-admin migration is part of this flow.

- **In progress (branch `feat/op-mainnet-deployment-clean`):** the approved Wave 6 UI and
  copy are implemented. The approval-receipt race, pending Check-status state,
  shared-book stale-write protection, earlier-payment sequencing, mint lease,
  and original-contract recovery are fixed locally and covered by the current
  verification suite. Merge and activation remain blocked pending Product Lead
  review and the approved Optimism Mainnet walkthrough.

- Approval-triggered minting is enabled. An authenticated Admin approval starts
  the server-side mint. Opening Admin and Reset also resume pending approved
  mints; `/api/cron/mint` does not broadcast transactions.

- Product Lead reviews the Optimism Mainnet NFT flow: payout locked before
  submission, approval-triggered mint by the backend mint key, whole-offer purchase (buyer pays the
  landlord address; NFT Safe → buyer atomic), renter `depositRent`, owner
  `claimRent`, and the not-configured state while the contract env is empty.
- **Remaining deployment gates (still closed).** Verify the deployed
  `MerkadoRentOfferV1` on **Optimism Mainnet**; set
  `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` in the approved environment; and
  approve controlled minter funding. The chain-store migration remains a
  separate reviewed gate, and hosted activation remains blocked. Each gate requires
  explicit Product Lead approval. Do **not** merge or activate the flow until
  each gate closes.
- Set `LABS_DEMO_PASSWORD` on the Labs Vercel Production environment,
  then approve commit and push so the host password is live on
  `merkado-labs.vercel.app`.
- **Luis** confirms `MERKADO_MINTER_PRIVATE_KEY` funding/rotation for the
  approved minter and the fee settlement path. The fee is informational and
  must never reduce the landlord below the purchase price shown.
- Stage 0 questions stay unresolved. Do not pretend they are closed.
  They are not shown on customer Home.

## Next

- Counsel opinions on M.1.2, M.1.3, M.1.4, and assignment mechanics.
- **Luis** completes an end-to-end **Optimism Mainnet** walkthrough after
  activation approval: Admin approval → automatic server mint → whole-offer purchase → renter `depositRent` → owner
  `claimRent` → NFT transfer to a new owner and claim as the new owner.
  Do **not** merge and do **not** activate hosted flows until that
  walkthrough works and the Product Lead approves.
- Confirm company fee settlement without reducing the landlord payout.
- Attested collection evidence from a real foundation sub-ledger (still no
  oracle).

## Later

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
| Approved contract deployment/activation | Contract deployed; hosted activation remains blocked |
| Chain store migration | Separate reviewed migration and approval gate |
| Mainnet minter funding + live mint | Not approved; requires controlled gas budget and Admin action |
| Hosted activation / merge | Product Lead approval after the Optimism Mainnet E2E |
| Uncontrolled real-funds operation | Explicitly blocked |
