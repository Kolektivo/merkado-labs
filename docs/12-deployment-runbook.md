# 12 - Deployment Runbook

**Purpose:** How to run the Labs demo locally. No production deploy unless asked.
**Last updated:** August 19, 2026 (Privy App ID + temporary RPC)

## Local dashboard

From the repository root:

```powershell
npm install
Copy-Item .env.example .env.local
# Fill Labs URL, publishable key, and service role
npm run dev
```

Open http://localhost:3000. Start at Overview. Local stays open unless
`LABS_DEMO_PASSWORD` is set.

Required env (Labs project `csaefdkpwukshtouyixg` only):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)

Optional:

- `NEXT_PUBLIC_PAY_NETWORK` (`op-sepolia` if empty)
- `NEXT_PUBLIC_PRIVY_APP_ID` — public App ID from the Privy dashboard.
  Empty = real wallet login is disabled. Public value, not a secret, but it
  must be set in the environment to enable external-wallet login.

Temporary RPC: the live provider and the server-side verifier use the public
OP Sepolia RPC `https://sepolia.optimism.io` for now. The Product Lead will
supply a specific RPC later; replace it where the adapter reads the URL. No
RPC key is committed.

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
- `NEXT_PUBLIC_PAY_NETWORK` (optional; default `op-sepolia`)
- `NEXT_PUBLIC_PRIVY_APP_ID` (public App ID; enables external-wallet login)

Live mode is OP Sepolia only. Base Sepolia is demo-selectable only; mainnet
stays off. The server-side verifier uses the temporary public OP Sepolia RPC
until the Product Lead supplies a specific RPC. No secret is required or
committed for the RPC today.

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
| Labs `.env.local` values | Read-only copy | Send `NEXT_PUBLIC_SUPABASE_URL`, the publishable key, `SUPABASE_SECRET_KEY`, and `NEXT_PUBLIC_PRIVY_APP_ID` for **Labs only**. Also send `LABS_DEMO_PASSWORD` so he can open the hosted walkthrough. |
| Privy app | Developer/owner on the Kolektivo Privy app | The public App ID enables external-wallet login. No embedded wallets. |
| RPC (later) | Product Lead-supplied Labs-only RPC key | Replaces the temporary public `https://sepolia.optimism.io` for the server verifier. Not required to start. |

### Do not give

| Platform | Why |
|---|---|
| Production Supabase `jkrfyvukhhsapoivntms` (merkado-curaçao) | Forbidden. Live customer data. |
| Production Vercel / merkado.cw | He is not deploying the marketplace. |
| GitHub **Admin** on the Kolektivo org | Write on `merkado-labs` is enough. |
| Supabase **Owner** on Labs | Developer can read schema. Owner can destroy the project. |
| A funded mainnet wallet | Real money. Testnet first. |
| Circle, OP, or Base “admin” | Not needed. Faucet and public RPCs are enough to start. |
| merkado-cw GitHub | Listing scrapers and the live storefront are out of this task. |
| A real Safe / Safe SDK access | The receiving address is a mock EOA. No Safe SDK, Safe watching, or holder payout in this MVP. |

### After you invite him

1. Send the link to `docs/07-integrations.md` in this repo.
2. Tell him the receiving address is the mock EOA
   `0x1726cf86DA996BC4B2F393E713f6F8ef83f2e4f6` and live mode is
   **OP Sepolia only**. Base Sepolia is demo-selectable; mainnet is off.
3. Tell him to verify the live walkthrough on **OP Sepolia** with test USDC
   and keep `PAYMENT_RAIL_MODE` on `"mock"` until the Product Lead
   walkthrough passes.
4. When his testnet pay walkthrough works, you still approve before anyone
   turns on OP Mainnet or Base Mainnet.

## Do not

- Deploy to Vercel from this repo unless the Product Lead asks
- Treat the existing Labs Vercel project as a public launch
- Remove the host password or leave Production without `LABS_DEMO_PASSWORD`
- Point env vars at project `jkrfyvukhhsapoivntms`
- Publish a public Merkado Direct page
- Invite Luis to production Supabase or the live merkado.cw Vercel project
