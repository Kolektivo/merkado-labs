# Merkado Property Labs Dashboard

Internal Next.js dashboard for the isolated property Labs project
`csaefdkpwukshtouyixg`. It is not the live Merkado vehicle marketplace.

## Run

From the repository root:

```powershell
npm --prefix apps/labs-dashboard install
npm --prefix apps/labs-dashboard run dev
```

Open `http://localhost:3000`. Internal routes require the local Labs admin
secret. Public `/browse` uses only the safe `public_property_listings` view.

The app reads ignored configuration from
`apps/labs-dashboard/.env.local`. Copy required Labs values from the repository
environment when setting up the app; do not commit either file.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `LABS_ADMIN_SECRET`

Never expose server credentials through `NEXT_PUBLIC_*`.

## Navigation

- `/` — Overview
- `/listings` and `/listings/[id]` — internal inventory and evidence
- `/sources` and `/sources/[sourceKey]` — source health and runs
- `/enrichment` — existing AI proposal review; execution disabled
- `/quality` — eligibility, lifecycle, fields, evidence, geography
- `/settings` — configuration and session health
- `/prototypes` — clearly separated experimental concepts
- `/browse` and `/browse/[id]` — public-safe Labs prototype

Legacy duplicate routes redirect into the consolidated areas.

## Verify

```powershell
npm --prefix apps/labs-dashboard run typecheck
npm --prefix apps/labs-dashboard run lint
npm --prefix apps/labs-dashboard run test:e2e
npm --prefix apps/labs-dashboard run build
```

The browser tests use installed Microsoft Edge in desktop and mobile profiles.

See `docs/LABS_DASHBOARD_GUIDE.md` for the full operating and troubleshooting
guide. Do not run adapters, imports, AI jobs, schedules, deployments, or
production operations without explicit approval.
