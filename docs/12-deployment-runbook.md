# 12 - Deployment Runbook

**Purpose:** How to run the Labs demo locally. No production deploy unless asked.
**Last updated:** August 21, 2026 (Luuk flow and Luis handoff)

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

Required env (Labs project `csaefdkpwukshtouyixg` only):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)

Optional: `NEXT_PUBLIC_PAY_NETWORK` (`base-sepolia` if empty).

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

Required Vercel env (Labs project `csaefdkpwukshtouyixg` only):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)
- `LABS_DEMO_PASSWORD` (server only; Production)
- `NEXT_PUBLIC_PAY_NETWORK` (optional; default `base-sepolia`)

## Database

Migrations live in `supabase/migrations/`. Only the Rent Advance rebuild and
dual-control trigger remain. Do not apply this to production.

## GitHub verification

`.github/workflows/verify.yml` runs lint, typecheck, unit tests, and build
on pull requests and on pushes to `main`. It uses Node 24, clearly fake
CI-only configuration values, and the approved Labs URL
`https://csaefdkpwukshtouyixg.supabase.co`. It must not receive production
credentials, write to Supabase, or expose secrets. The app requires
Node 22 or newer. Two optional packages (`@emnapi/core` and
`@emnapi/runtime`) are listed so Linux `npm ci` stays in sync with a
Windows-generated lockfile. After adding packages on Windows, confirm
`package-lock.json` still has `node_modules/@emnapi/core` and
`node_modules/@emnapi/runtime` at `1.11.3`. If `npm install` drops those
entries, restore them before pushing. They are not a wallet or chain
dependency.
`qrcode.react` renders the mock stablecoin payment QR locally; it does not
connect to a payment provider.

The first passing remote Verify run on `main` was 2026-08-19
(run 32228015203).

Luis draft preview for Wave 3 (PR #22, product-stale manual claim flow):
https://merkado-labs-git-task-pr21-mocked-proceeds-claim-kolektivolabs.vercel.app
Vercel SSO is on. After SSO, the app still requires
`LABS_DEMO_PASSWORD`; do not put that password in Git or chat. Local
review of that same branch: run it on
http://localhost:3001 from a separate worktree. Do not merge.

## Access to give Luis (Web3)

Luis only needs the **Labs** demo. He does not need merkado.cw
production. Full developer brief: `docs/07-integrations.md`.

Share secrets through a password manager, not email, Slack, or GitHub.

### Give (recommended)

| Platform | Role | How |
|---|---|---|
| GitHub repo [Kolektivo/merkado-labs](https://github.com/Kolektivo/merkado-labs) | **Write** collaborator | Repo → **Settings** → **Collaborators** → **Add people** → choose **Write**. He should open a pull request, not push to `main`. |
| Vercel team **Kolektivo Labs**, project `merkado-labs` | **Developer** or **Member** | [vercel.com](https://vercel.com) → the Kolektivo Labs team → **Settings** → **Members** → invite his email. Do **not** add him to the live merkado.cw Vercel project. |
| Supabase **merkado-labs** (`csaefdkpwukshtouyixg`) | **Developer** | [supabase.com](https://supabase.com) → open the Labs project (check the reference is `csaefdkpwukshtouyixg`) → **Project Settings** → **Team** → invite as **Developer**. |
| Labs `.env.local` values | Read-only copy | Send `NEXT_PUBLIC_SUPABASE_URL`, the publishable key, and `SUPABASE_SECRET_KEY` for **Labs only**. Also send `LABS_DEMO_PASSWORD` so he can open the hosted walkthrough. |
| Safe{Wallet} | Testnet operator on the existing 2-of-3 company Safe | Keep that Safe for offer creation and fees. Ask him to create a **second** Base Sepolia **sales proceeds** Safe. Do not start with a mainnet Safe that holds real USDC. |
| Reown / WalletConnect Cloud | Member on a Labs project | He can create the project. Prefer inviting him into a Kolektivo-owned project so the connect ID is not a personal account. |
| Privy, only if selected after Luis recommends an adapter | Developer on a Kolektivo-owned Labs app | Do not create a personal production dependency or add billing without approval. |

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
2. Tell him the company Safe can stay the existing Base Sepolia 2-of-3
   Safe, and that he should create a second **sales proceeds** Safe. The new
   design is whole-offer purchase plus automatic landlord payout; PR #22's
   manual claim must not be merged. Send `docs/07-integrations.md`.
3. Tell him not to install a wallet SDK until you reply that the
   integration task is approved.
4. When his Base Sepolia pay walkthrough works, you still approve before
   anyone repeats the Safe on **Base Mainnet**.

## Do not

- Deploy to Vercel from this repo unless the Product Lead asks
- Treat the existing Labs Vercel project as a public launch
- Remove the host password or leave Production without `LABS_DEMO_PASSWORD`
- Point env vars at project `jkrfyvukhhsapoivntms`
- Publish a public Merkado Direct page
- Invite Luis to production Supabase or the live merkado.cw Vercel project
