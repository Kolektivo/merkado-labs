# 08 - Security and Privacy

**Purpose:** Privacy, authentication, authorization, RLS, and environment safety
for Merkado Labs.
**Last updated:** August 25, 2026 (display-only 60-day window, reset/new epoch, QR informational, customer statuses)

**Enforcement:** `.cursor/rules/merkado-labs-safety.mdc` (do not weaken).
**Related:** `05-architecture.md`, `06-data-model.md`, `12-deployment-runbook.md`.

Merged from former `docs/labs/SAFETY_RULES.md` and safety sections of former
`docs/09-project-safety-and-history.md`, plus Passport user-data principles.

## 1. Environment boundary

The live Merkado system must remain completely untouched.

**Allowed Supabase target only:**

- name: `merkado-labs`
- project reference: `ewoxmzznkavapcxdporm`
- region (Labs identity): `eu-west-3`

**Forbidden production target:**

- name: `merkado-curaçao`
- project reference: `jkrfyvukhhsapoivntms`

Never:

- access or modify production Supabase;
- run SQL against production;
- reset any database;
- copy production users, schemas, credentials, secrets, or private data;
- use production service-role credentials;
- expose service-role credentials to browser code, logs, reports, or source control;
- modify or deploy the production Vercel project / live Merkado domain;
- write test data to production;
- push changes to GitHub without explicit approval;
- automatically promote experiments to production;
- edit applied migrations in place;
- run unreviewed destructive commands.

## 2. Required workflow before writes

1. Begin with read-only repository and schema inspection.
2. Verify the exact Labs project name and reference before every write.
3. Confirm the connected project is clearly experimental (`Merkado Labs`,
   `Merkado Test`, or `Merkado Development`). Stop if not confirmed.
4. Use forward-only migrations or reviewed controlled server-side scripts.
5. Represent every approved database change in a reviewed migration file.
6. Enable RLS on every table created in an exposed schema.
7. Never run destructive SQL without explicit approval.
8. Never commit secrets. Keep `.env` files local and ignored. Only
   `.env.example` placeholder names may be documented in the repository —
   never real credential values.
9. Personal data in the demo must be placeholders. Do not commit real landlord,
   tenant, or bank details. The Create Offer renter step warns that the demo is
   shared and requires fictional information.
10. Purchaser screens must not expose tenant identity, employer, or address.

## 3. Demo access

- Labs uses Supabase Auth with email magic links and optional Google social
  sign-in. This is a
  Labs demo identity, not production Merkado authentication.
- `LABS_DEMO_PASSWORD` is a deployment gate before sign-in. When configured,
  hosted users must pass the gate and authenticate before protected routes
  open. Do not use the paid Vercel password add-on.
- Local `npm run dev` stays open unless `LABS_DEMO_PASSWORD` is set.
- Hosted production stays locked if that password is missing.
- Each authenticated user owns an isolated Labs demo book. The app uses the
  Labs Supabase project only and does not reuse production profiles or data.
- Reset the book is in Admin so a walkthrough can restore the seeded book.

## 4. Authorization and RLS

- Every `ra_*` table has RLS enabled.
- `anon` and `authenticated` have no grants. Browser code never talks to these
  tables directly.
- Server components and server actions use the Labs service role. Browser
  code never receives that key.
- Offer server actions strip undeclared root and nested fields before writing
  the shared JSON book. Crafted or unknown fields are never retained.
- Dual-control release is rejected if instructor and signatory are the same person
  (application check on every save, and a database trigger on `ra_demo_state`).

## 5. Retired pipeline safety

The property pipeline, scrapers, and public listing browse have been removed from
this repository. Do not restore them here. Live marketplace ingestion is
merkado-cw only.

The 2026-08-14 Labs schema rebuild dropped the old listing tables after Product
Lead instruction to reuse this repo for the Rent Advance / Direct demo. Do not
point any leftover script at those names.

## 6. Deployment and technology safety

- Labs dashboard may only use a **separate** Labs Vercel project with the
  repository root and Labs publishable env vars.
- Do not link this directory to the production Merkado Vercel project.
- Do not create, link, change environment variables, or deploy without explicit
  repository-owner approval.
- Do not add a new frontend surface, browser automation, AI framework, vector
  database, or knowledge-graph technology without an explicit task.
- Keep work focused on the Curaçao Direct / Pay demo.
- The Base Sepolia flow is the only approved crypto implementation
  (ADR-0008): one non-upgradeable ERC-721 (`MerkadoRentOfferV1`), pooled USDC
  rent per token id, backend mint key, transferable NFT where the current
  owner is the holder, whole-offer purchase paid to the locked landlord
  address, `depositRent` (exact monthly amount), and
  `claimRent` by the current owner. There is no mock provider,
  `PAYMENT_RAIL_MODE`, demo wallet, demo outcome menu, or demo hashes.
- **Not approved and not activated:** contract deployment, applying the chain
  store migration, sending test USDC, Safe transactions, hosted activation,
  and merging the PR. Base Mainnet, real funds, and production stay blocked.
  A client can never mark rent paid on its own; the server confirms from
  verified chain events.
- No real transaction can be initiated before the deployment gates close and
  the Product Lead approves.

Operational detail: `12-deployment-runbook.md`.

## 7. Privacy walls

- Wallet addresses, token ids, and payout amounts are **public on-chain**
  once the contract is active. Tenant and property identity stay off-chain.
- Payer screens: no fee, purchase price, holders, or scheduled holder figures.
  The browser receives only public network facts (network, chain, token,
  decimals, explorer) and the public contract address.
- Purchaser screens: no tenant name, employer, address, contact, or exact
  income. Address-like free text is replaced with a neutral Curaçao label
  before entering the purchaser payload.
- Landlord screens: no holder wallet details beyond the public token owner.
  The locked landlord payout address stays server-side and must not appear on
  Marketplace, Pay, or Portfolio surfaces, even though it is on-chain.
- The landlord payout address is chosen before submission and locked for the
  offer; the buyer pays that exact address. There is no landlord claim action.
- Merkado is not a custody product. After sale, monthly rent sits in the
  pooled contract until the current NFT owner claims it.
- No public offering copy. Sole-holder mode until written opinions exist.
- The related-party flag and note are internal review facts. Neither enters
  the purchaser payload. They are not an excuse for softer arrears.

## 8. Chain safety (Base Sepolia flow)

- Never expose the service-role key or `MERKADO_RPC_URL` credentials to
  browser code, logs, or source control.
- Server-side verification must check: correct chain (`cryptoConfig.chainId`),
  exact expected event (mint / purchase / transfer / deposit / claim),
  exact atomic amount, the current token owner for claims, and at most one
  confirmed deposit per payment request.
- A different address is rejected for a locked landlord payout once set.
- The pooled USDC balance must always be ≥ total deposited-but-unclaimed
  rent (the contract enforces the invariant; the server verifies it).
- Show an explorer link only when the base URL is an official catalog
  explorer (Base Sepolia, Base Mainnet, or a later catalog network) **and** the
  hash is a real 64-hex `0x` value. There are no demo hashes.
- The chain store tables (`ra_chain_*`, `ra_rent_*`) have RLS on and no
  `anon` / `authenticated` grants. They are written only by server-side
  verification.
- The shared walkthrough persists **Base Sepolia**. Mainnet
  stays off unless `NEXT_PUBLIC_PAY_NETWORK` is `base-mainnet`.
  Short names such as `base` or `op` must not select mainnet.
- The Pay QR and **copy address** / **copy amount** controls are
  **informational only** — they display the receiving address, USDC amount,
  and payment reference and never submit (or encourage) a plain USDC
  transfer. The only payment path is the wallet **Pay rent** action calling
  `depositRent(tokenId, opaquePaymentId, amount)`.
- Admin **Reset** does **not** roll back the chain. It seeds a fresh demo
  book (canonical offers as `funding`, empty on-chain state) and starts a
  **new chain-store epoch** so old on-chain facts are never reused; the env
  contract address stays active so approved offers mint again on the same
  deployment.
- An empty `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` must show a not-configured
  state and never fake a transaction.

## 9. Service-role credential rules

Service-role credentials may be used only by Next.js server code and local
backend scripts. Never commit, print, log, or expose them to browser code.

## 10. Private local documentation (`docs/private/`)

`docs/private/` is a **local-only**, **gitignored**, **non-canonical** workspace.
Per Product Lead decision (ADR-0002), **all** of the following are local-only:

- meeting notes (`docs/private/meetings/`)
- research / historical evidence files (`docs/private/research/`)
- detailed task ledgers (`docs/private/tasks/`)
- scratch material (`docs/private/scratch/`)

Do **not** keep tracked `docs/meetings/`, `docs/research/`, or `docs/tasks/`
folders. Keep `docs/ai/` and `docs/decisions/` tracked.

Rules:

- Never commit anything under `docs/private/`.
- Do not copy private content into tracked documentation unless the Product
  Lead explicitly approves that content for the repository.
- Approved, non-sensitive outcomes still belong in canonical docs
  (`docs/00`–`12` and ADRs).
- The repository must remain understandable without access to `docs/private/`.
- Secrets, credentials, and production data still follow the rules above —
  private docs are not a place to store service-role keys or production copies.
- Deleting tracked files from the working tree does not erase older Git history;
  do not rewrite history to hide formerly tracked evidence.
