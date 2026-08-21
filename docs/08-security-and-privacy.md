# 08 - Security and Privacy

**Purpose:** Privacy, authentication, authorization, RLS, and environment safety
for Merkado Labs.
**Last updated:** August 20, 2026 (Base Sepolia / Base Mainnet)

**Enforcement:** `.cursor/rules/merkado-labs-safety.mdc` (do not weaken).
**Related:** `05-architecture.md`, `06-data-model.md`, `12-deployment-runbook.md`.

Merged from former `docs/labs/SAFETY_RULES.md` and safety sections of former
`docs/09-project-safety-and-history.md`, plus Passport user-data principles.

## 1. Environment boundary

The live Merkado system must remain completely untouched.

**Allowed Supabase target only:**

- name: `merkado-labs`
- project reference: `csaefdkpwukshtouyixg`
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
   tenant, or bank details.
10. Purchaser screens must not expose tenant identity, employer, or address.

## 3. Demo access

- There is no Merkado login and no admin cookie.
- After this change is deployed with `LABS_DEMO_PASSWORD` set on Vercel
  Production, the hosted demo uses a shared host password. Visitors see
  `/enter` until that password is entered. This is not a customer
  account. Do not use the paid Vercel password add-on. The live URL is
  still open until that deploy.
- Local `npm run dev` stays open unless `LABS_DEMO_PASSWORD` is set.
- Hosted production stays locked if that password is missing.
- The Merkado account mock is fictional Labs UI. It does not reuse
  production auth or profile queries.
- Reset the book is in Admin so a walkthrough can restore the seeded book.

## 4. Authorization and RLS

- Every `ra_*` table has RLS enabled.
- `anon` and `authenticated` have no grants. Browser code never talks to these
  tables directly.
- Server components and server actions use the Labs service role. Browser
  code never receives that key.
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
- Wallet, Safe, USDC, transactions, and distributions remain mocked until
  a separately approved Luis/Luuk integration task. Do not install a real
  wallet or Safe SDK before that approval. When that adapter ships, flip
  `PAYMENT_RAIL_MODE` to `"live"` in the same change and confirm Pay from
  chain data on the server — do not keep the 1.4s client auto-confirm.
- No real transaction can be initiated from any control.

Operational detail: `12-deployment-runbook.md`.

## 7. Privacy walls

- Payer screens: no fee, purchase price, holders, or scheduled holder figures.
- Purchaser screens: no tenant name, employer, address, contact, or exact income.
- Landlord screens: no holder wallet or Safe address.
- The landlord claim destination EOA is **server-only**. It never crosses
  into the payer, purchaser, or portfolio surfaces, and it never implies
  wallet ownership. `txHash` stays `null` for landlord payouts.
- No public offering copy. Sole-holder mode until written opinions exist.
- Related-party family facts are disclosed to holders; they are not an excuse
  for softer arrears.

## 8. Mock wallet and payment-link safety

- Mock addresses must be obviously fictional and unusable for real funds.
- Never put secrets or sensitive identity in a URL.
- Payment deep-link IDs in this demo are fictional. Production links need
  opaque, scoped, expiring authorization.
- Do not silently report a successful saved payment if Labs persistence is
  unavailable.
- Show an explorer link only when the base URL is an official catalog
  explorer (Base Sepolia, Base Mainnet, or a later catalog network) **and** the
  hash is a real 64-hex `0x` value. Demo `0xDEMO…` hashes must not open
  the explorer.
- `confirmPaymentAction` is a Labs mock write. It must not trust a client
  ledger id. Live Pay must confirm from chain data on the server.
- The shared walkthrough persists **Base Sepolia**. Mainnet
  stays off unless `NEXT_PUBLIC_PAY_NETWORK` is `base-mainnet`.
  Short names such as `base` or `op` must not select mainnet.
- The landlord proceeds claim (PR #21) is a **mock business allocation**,
  not an on-chain transfer receipt. It never verifies against the chain and
  is never written to `ra_payment_verifications`. The claim destination is
  an **unverified demo EOA** (fictional only), never a real personal wallet;
  `txHash` stays `null` and no explorer link is shown.
- The shared host password is **not landlord authentication**. A claim is a
  mock demo action, not proof of wallet ownership or genuine landlord
  authorisation.

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
