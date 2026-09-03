# 12 - Deployment Runbook

**Purpose:** How to run the Labs demo locally. No production deploy unless asked.
**Last updated:** September 2, 2026 (interim wallet identity)

## Local dashboard

From the repository root:

```powershell
npm install
Copy-Item .env.example .env.local
# Fill Labs URL, publishable key, and service role
npm run dev
```

Open http://localhost:3000. Start at Home. Local stays open unless
`LABS_DEMO_PASSWORD` is set.

Required env (Labs project `ewoxmzznkavapcxdporm` only):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)

Optional:

- `WALLET_SESSION_SECRET` — server-only, at least 32 random characters for the
  interim wallet identity session
- `NEXT_PUBLIC_PAY_NETWORK` (`base-sepolia` if empty)
- `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` — the single source of truth for the
  Base Sepolia contract address, used every time. Empty → surfaces show a
  not-configured state
- `MERKADO_MINTER_PRIVATE_KEY` — server-only Base Sepolia key the backend uses to mint offer NFTs
- `CRON_SECRET` — server-only secret authorizing `/api/cron/mint` (the background mint sweep)
- `MERKADO_RPC_URL` — server-only; defaults to `https://sepolia.base.org`

### Interim wallet identity

The wallet identity challenge migration is reviewed in
`supabase/migrations/20260902120000_wallet_identity_challenges.sql` but is not
applied automatically. Apply **only that migration** to the approved Labs fork
`ajbeqiwgpttpmzpqxepl`, after setting `SUPABASE_DB_PASSWORD` privately. Do not
run a broad `supabase db push` while the separately gated NFT chain-store
migration is pending. Never use the production project reference.

Generate and set `WALLET_SESSION_SECRET` in the local/server environment; do not
commit it.

## Vercel (Labs demo host)

An existing Vercel project does **not** mean public deployment is approved.
Vercel Production follows `main`. Hosted production fails closed at `/enter`
and needs the shared app password. Do not buy the Vercel password add-on.
GitHub Verify (`npm ci`) can fail even when Vercel is Ready if the lockfile
is missing `@emnapi/core` and `@emnapi/runtime` after a Windows `npm install`.

Add this server-only env on the **Production** environment before the
password page can unlock:

- `LABS_DEMO_PASSWORD`

Never put the real password in the repository. After a Git deploy, open
https://merkado-labs.vercel.app in a private window. You should see
**Merkado Labs** and **Shared password**, not Overview.

The Next.js app lives at the **repository root**. The Vercel project
`merkado-labs` (Kolektivo Labs) must keep **Root Directory empty**. Do not set
it to `apps/labs-dashboard` — that folder was removed.

That hosted URL is not a public launch.

Required Vercel env (Labs project `ewoxmzznkavapcxdporm` only):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)
- `LABS_DEMO_PASSWORD` (server only; Production)
- `NEXT_PUBLIC_PAY_NETWORK` (optional; default `base-sepolia`)
- `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` (optional; empty until deployed)
- `MERKADO_MINTER_PRIVATE_KEY` (server-only; required for automatic minting)
- `MERKADO_RPC_URL` (optional server-only; default `https://sepolia.base.org`)

## Database

Migrations live in `supabase/migrations/`. The Rent Advance rebuild and
dual-control trigger are applied. The Base Sepolia chain store migration
(`ra_chain_epochs`, `ra_chain_offers`, `ra_chain_events`,
`ra_rent_payment_attempts`, `ra_rent_deposit_verifications`,
`ra_rent_claim_verifications`) is **not applied** — applying it requires
explicit approval. Do not apply any of this to production.

## Contract deployment gates

The Base Sepolia flow stays inactive until all of the following are
explicitly approved and done (see `docs/10-execution-roadmap.md`):

1. Deploy and verify `MerkadoRentOfferV1` on **Base Sepolia**.
2. Set `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` to the verified address. The
   env value is the single source of truth and is used every time.
   Current cold-start (2026-08-24): `0x2075653c0aab05d2331886cbd01f8b8e40fc400f`
   (minter `0x27D9333E178BEeaA92EE0e5C80DE75C133eA19E5`). Verify with
   `forge verify-contract <addr> contracts/MerkadoRentOfferV1.sol:MerkadoRentOfferV1
   --chain 84532 --constructor-args <encoded>` (falls back to Sourcify without an
   API key).
3. Apply the chain store migration.
4. Send test USDC (the backend mint key signs `mintOffer` directly).
5. Product Lead approves hosted activation and the merge.

**Reset / redeploy pairing (2026-08-25).** Admin **Reset the book** seeds a
fresh demo book (**MRA-001** + **MRA-010** as `funding` offers with **empty
on-chain state**) and starts a **new chain-store epoch** so old on-chain
facts are never reused. Reset does **not** roll back the chain; the env
contract address stays active so approved offers mint again on the same
deployment. Pairing Reset operationally with a fresh Base Sepolia
contract redeploy + env address update (steps 1–2
above) is a separate approved gate so the demo book and the chain start from
the same clean state. Each of those steps remains a separate approved gate.

Base Mainnet and real funds remain blocked. Do not deploy the contract to
Base Mainnet from this repository.

## GitHub verification

`.github/workflows/verify.yml` runs lint, typecheck, unit tests, and build
on pull requests and on pushes to `main`. It uses Node 24, clearly fake
CI-only configuration values, and the approved Labs URL
`https://ewoxmzznkavapcxdporm.supabase.co`. It must not receive production
credentials, write to Supabase, or expose secrets. The app requires
Node 22 or newer. Two optional packages (`@emnapi/core` and
`@emnapi/runtime`) are listed so Linux `npm ci` stays in sync with a
Windows-generated lockfile. After adding packages on Windows, confirm
`package-lock.json` still has `node_modules/@emnapi/core` and
`node_modules/@emnapi/runtime` at `1.11.3`. If `npm install` drops those
entries, restore them before pushing. They are not a wallet or chain
dependency.

The first passing remote Verify run on `main` was 2026-08-19
(run 32228015203).

## Access to give Luis (Web3)

Luis only needs the **Labs** demo. He does not need merkado.cw
production. Full developer brief: `docs/07-integrations.md`.

Share secrets through a password manager, not email, Slack, or GitHub.

### Give (recommended)

| Platform | Role | How |
|---|---|---|
| GitHub repo [Kolektivo/merkado-labs](https://github.com/Kolektivo/merkado-labs) | **Write** collaborator | Repo → **Settings** → **Collaborators** → **Add people** → choose **Write**. He should open a pull request, not push to `main`. |
| Vercel team **Kolektivo Labs**, project `merkado-labs` | **Developer** or **Member** | [vercel.com](https://vercel.com) → the Kolektivo Labs team → **Settings** → **Members** → invite his email. Do **not** add him to the live merkado.cw Vercel project. |
| Supabase **merkado-labs** (`ewoxmzznkavapcxdporm`) | **Developer** | [supabase.com](https://supabase.com) → open the Labs project (check the reference is `ewoxmzznkavapcxdporm`) → **Project Settings** → **Team** → invite as **Developer**. |
| Labs `.env.local` values | Read-only copy | Send `NEXT_PUBLIC_SUPABASE_URL`, the publishable key, and `SUPABASE_SECRET_KEY` for **Labs only**. Also send `LABS_DEMO_PASSWORD` so he can open the hosted walkthrough. |
| Minter | Testnet EOA backing `MERKADO_MINTER_PRIVATE_KEY` | The backend mint key mints offer NFTs. Do not use a mainnet key or real USDC. |
| Reown / WalletConnect Cloud | Member on a Labs project | He can create the project. Prefer inviting him into a Kolektivo-owned project so the connect ID is not a personal account. |
| Privy, only if selected | Developer on a Kolektivo-owned Labs app | Do not create a personal production dependency or add billing without approval. |

### Do not give

| Platform | Why |
|---|---|
| Production Supabase `jkrfyvukhhsapoivntms` (merkado-curaçao) | Forbidden. Live customer data. |
| Production Vercel / merkado.cw | He is not deploying the marketplace. |
| GitHub **Admin** on the Kolektivo org | Write on `merkado-labs` is enough. |
| Supabase **Owner** on Labs | Developer can read schema. Owner can destroy the project. |
| A funded mainnet Safe | Real money. Testnet first. |
| Circle, OP, or Base “admin” | Not needed. Faucet and public RPCs are enough to start. |
| merkado-cw GitHub | Listing scrapers and the live storefront are out of this task. |

### After you invite him

1. Send the link to `docs/07-integrations.md` in this repo.
2. The backend mint key is the EOA behind `MERKADO_MINTER_PRIVATE_KEY`
   (`0xfC6ec9718d89d4935594E7DB78399913071FcDc4`) and mints offer NFTs. The
   design is one transferable ERC-721 per listing; the old PR #19 / #20 / #22
   draft framing is superseded by ADR-0008.
3. Tell him the contract deployment, chain store migration, test USDC, and
   Safe transactions each need the Product Lead's approval.
4. When his Base Sepolia walkthrough works, you still approve before
   anyone moves toward **Base Mainnet**.

## Do not

- Deploy to Vercel from this repo unless the Product Lead asks
- Treat the existing Labs Vercel project as a public launch
- Remove the host password or leave Production without `LABS_DEMO_PASSWORD`
- Point env vars at project `jkrfyvukhhsapoivntms`
- Publish a public Merkado Direct page
- Invite Luis to production Supabase or the live merkado.cw Vercel project
- Deploy the contract, apply the chain store migration, send test USDC, or
  execute Safe transactions without explicit approval
- Deploy `MerkadoRentOfferV1` on Base Mainnet or use real funds
