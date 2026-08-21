# 12 - Deployment Runbook

**Purpose:** How to run the Labs demo locally. No production deploy unless asked.
**Last updated:** August 20, 2026 (Base Sepolia / Base Mainnet)

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
After this change is deployed, the hosted URL stays live and asks for a
shared host password. Do not buy the Vercel password add-on. The current
live URL is still open until that deploy.

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
Windows-generated lockfile. They are not a wallet or chain dependency.

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
| Supabase **merkado-labs** (`csaefdkpwukshtouyixg`) | **Developer** | [supabase.com](https://supabase.com) → open the Labs project (check the reference is `csaefdkpwukshtouyixg`) → **Project Settings** → **Team** → invite as **Developer**. |
| Labs `.env.local` values | Read-only copy | Send `NEXT_PUBLIC_SUPABASE_URL`, the publishable key, and `SUPABASE_SECRET_KEY` for **Labs only**. Also send `LABS_DEMO_PASSWORD` so he can open the hosted walkthrough. |
| Safe{Wallet} | Not required as a lasting owner | Luis created the **Base Sepolia** Safe (`0xfC6ec9718d89d4935594E7DB78399913071FcDc4`) with Enrique, Luuk, and Luis as the owners (**2 of 3**). Do not start with a mainnet Safe that holds real USDC. |
| Reown / WalletConnect Cloud | Member on a Labs project | He can create the project. Prefer inviting him into a Kolektivo-owned project so the connect ID is not a personal account. |

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
2. Tell him to create the test Safe on **Base Sepolia**, not Base Mainnet.
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
