# 12 - Deployment Runbook

**Purpose:** How to run the Labs demo locally. No production deploy unless asked.
**Last updated:** August 19, 2026

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

Optional: `NEXT_PUBLIC_PAY_NETWORK` (`op-sepolia` if empty).

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

## Do not

- Deploy to Vercel from this repo unless the Product Lead asks
- Treat the existing Labs Vercel project as a public launch
- Remove the host password or leave Production without `LABS_DEMO_PASSWORD`
- Point env vars at project `jkrfyvukhhsapoivntms`
- Publish a public Merkado Direct page
