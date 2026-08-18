# 12 - Deployment Runbook

**Purpose:** How to run the Labs demo locally. No production deploy unless asked.
**Last updated:** August 14, 2026

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

The Next.js app lives at the **repository root**. The Vercel project
`merkado-labs` (Kolektivo Labs) must keep **Root Directory empty**. Do not set
it to `apps/labs-dashboard` — that folder was removed.

Production URL after a successful Git deploy: https://merkado-labs.vercel.app

Required Vercel env (Labs project `csaefdkpwukshtouyixg` only):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)

## Database

Migrations live in `supabase/migrations/`. Only the Rent Advance rebuild and
dual-control trigger remain. Do not apply this to production.

## Do not

- Deploy to Vercel from this repo unless the Product Lead asks
- Point env vars at project `jkrfyvukhhsapoivntms`
- Publish a public Merkado Direct page
