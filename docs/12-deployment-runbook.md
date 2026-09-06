# 12 - Deployment Runbook

**Purpose:** How to run the Labs demo locally. No production deploy unless asked.
**Last updated:** September 6, 2026 (Optimism Mainnet deployment and app cutover — not activated)

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
- `ADMIN_EMAILS` (server-only comma-separated Labs Admin allowlist)
- `NEXT_PUBLIC_SITE_URL` (approved Auth callback origin)

Optional:

- `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` — the single source of truth for the
  Optimism Mainnet contract address, used every time. Empty → surfaces show a
  not-configured state
- `MERKADO_MINTER_PRIVATE_KEY` — server-only Optimism Mainnet key used for approval-triggered server minting
- `MERKADO_RPC_URL` — server-only; defaults to `https://mainnet.optimism.io`

Supabase Auth is configured in the Labs project only, with email magic links.
Identity-only OAuth authorization is also supported. Approved callback origins include local `http://localhost:3000`
and the Labs hosted URL. When `LABS_DEMO_PASSWORD` is set, it is required
before sign-in; protected hosted routes then require the authenticated session.

The reviewed account/wallet migration
`20260831000000_labs_accounts_and_wallets.sql`, atomic wallet-link migration
`20260905130000_atomic_wallet_link.sql`, chain-store migration
`20260821120000`, shared-state migration
`20260905140000_shared_demo_state.sql`, and chain-epoch invariant migration
`20260905150000_chain_epoch_invariant.sql` are applied to the approved Labs
project. Migration history is reconciled. Do not apply migrations to
production.

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
- `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` (optional; current deployed address is recorded below)
- `MERKADO_MINTER_PRIVATE_KEY` (server-only; required for approval-triggered server minting)
- `MERKADO_RPC_URL` (optional server-only; default `https://mainnet.optimism.io`)

## Database

Migrations live in `supabase/migrations/`. The Rent Advance rebuild,
dual-control trigger, account/wallet migrations, chain-store migration, and
shared-state/epoch-invariant follow-ons are applied to Labs. Do not apply any
of this to production.

## Contract deployment gates

The Optimism Mainnet flow stays inactive until all of the following are
explicitly approved and done (see `docs/10-execution-roadmap.md`):

1. Verify the manually deployed `MerkadoRentOfferV1` on **Optimism Mainnet**.
2. Set `NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS` to the verified address. The
   env value is the single source of truth and is used every time.
   Current deployment: `0x97439e4352b9428F56651be7DE95224B1c83b711`
   (minter `0x27D9333E178BEeaA92EE0e5C80DE75C133eA19E5`). Verify with
   `forge verify-contract <addr> contracts/MerkadoRentOfferV1.sol:MerkadoRentOfferV1
    --chain 10 --constructor-args <encoded>` (falls back to Sourcify without an
   API key).
3. Apply the chain store migration.
4. Approve controlled minter funding and execute the approval-triggered mint flow.
5. Product Lead approves hosted activation and the merge.

**Reset / redeploy pairing (2026-08-25).** Admin **Reset the book** seeds a
fresh demo book (**MRA-001** + **MRA-010** as `funding` offers with **empty
on-chain state**) and starts a **new chain-store epoch** so old on-chain
facts are never reused. Reset does **not** roll back the chain; the env
contract address stays active so approved offers mint again on the same
 deployment. Pairing Reset operationally with a fresh Optimism Mainnet
contract redeploy + env address update (steps 1–2
above) is a separate approved gate so the demo book and the chain start from
the same clean state. Each of those steps remains a separate approved gate.

Uncontrolled real-funds operation remains blocked. Do not deploy another
contract or activate hosted flows without explicit approval.

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
   (`0x27D9333E178BEeaA92EE0e5C80DE75C133eA19E5`) and mints offer NFTs only
   after independent Admin approval. The design is one transferable ERC-721
   per listing; the old PR #19 / #20 / #22 draft framing is superseded by
   ADR-0008 and ADR-0010.
3. Tell him the contract verification, chain store migration, minter funding,
   and hosted activation each need the Product Lead's approval.
4. Complete the Optimism Mainnet walkthrough only after activation approval.

## Do not

- Deploy to Vercel from this repo unless the Product Lead asks
- Treat the existing Labs Vercel project as a public launch
- Remove the host password or leave Production without `LABS_DEMO_PASSWORD`
- Point env vars at project `jkrfyvukhhsapoivntms`
- Publish a public Merkado Direct page
- Invite Luis to production Supabase or the live merkado.cw Vercel project
- Deploy another contract, apply the chain store migration, fund the minter, or
  execute Mainnet transactions without explicit approval
