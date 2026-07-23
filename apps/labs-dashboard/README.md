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
secret. Public `/browse` listing facts use the safe `public_property_listings`
view; Passport activity is fetched server-side and rendered through the shared
public-safe event filter (labels/dates/price deltas only).

The app reads ignored configuration from
`apps/labs-dashboard/.env.local`. Copy required Labs values from the repository
environment when setting up the app; do not commit either file.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `LABS_ADMIN_SECRET`

Optional (Data Operations → GitHub `workflow_dispatch`):

- `GITHUB_REPOSITORY`
- fine-grained `GITHUB_TOKEN` (server-only)

Never expose server credentials through `NEXT_PUBLIC_*`.

## Navigation

- `/` — Overview
- `/listings` and `/listings/[id]` — internal inventory and evidence
- `/sources` and `/sources/[sourceKey]` — source health and runs
- `/enrichment` — existing AI proposal review; **AI execution disabled**
- `/quality` — eligibility, lifecycle, fields, evidence, geography
- `/data-operations` — Labs property pipeline enqueue/dispatch
- `/settings` — configuration and session health (Automatic refresh On;
  default-branch daily cron observed 2026-07-22)
- `/browse` and `/browse/[id]` — public-safe Labs **public preview** with
  XCG-primary pricing and filtered Passport history
- `/prototypes`, `/what-fits-me`, `/search-requests`, and
  `/match-reports/[requestId]` — What Fits Me natural-language intake, live
  deterministic matches from public listings, saved Property Search / Your
  matches. No Agent branding, billing, paywall, or email.

Legacy duplicate routes redirect into the consolidated areas.

## Verify

```powershell
npm --prefix apps/labs-dashboard run typecheck
npm --prefix apps/labs-dashboard run lint
npm --prefix apps/labs-dashboard run test:unit
npm --prefix apps/labs-dashboard run test:contracts
npm --prefix apps/labs-dashboard run test:e2e
npm --prefix apps/labs-dashboard run build
```

The browser tests use installed Microsoft Edge in desktop and mobile profiles.

See `docs/11-testing-and-uat.md` for the full verify matrix and Product Lead UAT
format, and `docs/12-deployment-runbook.md` for the full operating and
troubleshooting guide. Do not run adapters, imports, AI jobs, schedules,
deployments, or production operations without explicit approval.
