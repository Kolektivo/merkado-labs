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

Open http://localhost:3000. Start at Overview.

Required env (Labs project `csaefdkpwukshtouyixg` only):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)

## Vercel (Labs demo host)

An existing Vercel project does **not** mean public deployment is approved.
The demo must remain **protected or paused** until the Product Lead
explicitly approves who may open it. Deployment access is handled in
Vercel, not by adding application login.

The Next.js app lives at the **repository root**. The Vercel project
`merkado-labs` (Kolektivo Labs) must keep **Root Directory empty**. Do not set
it to `apps/labs-dashboard` — that folder was removed.

Hosted URL after a Git deploy, if the project is running:
https://merkado-labs.vercel.app. That URL is not a public launch.

Required Vercel env (Labs project `csaefdkpwukshtouyixg` only):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)

## Database

Migrations live in `supabase/migrations/`. Only the Rent Advance rebuild and
dual-control trigger remain. Do not apply this to production.

## GitHub verification

`.github/workflows/verify.yml` runs lint, typecheck, unit tests, and build
on pull requests and on pushes to `main`. It uses clearly fake CI-only
configuration values and the approved Labs URL
`https://csaefdkpwukshtouyixg.supabase.co`. It must not receive production
credentials, write to Supabase, or expose secrets.

A workflow file in the repository is not a passing GitHub check. Treat
GitHub CI as pending until a remote run has completed.

## Do not

- Deploy to Vercel from this repo unless the Product Lead asks
- Treat the existing Labs Vercel project as a public launch
- Remove Vercel protection or unpause the demo without Product Lead approval
- Point env vars at project `jkrfyvukhhsapoivntms`
- Publish a public Merkado Direct page
