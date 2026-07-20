# Merkado Property Labs Dashboard Guide

The dashboard is an internal view of the isolated property Labs dataset. It is
not connected to the live vehicle marketplace and property prototypes are not
live on `merkado.cw`.

## Start Labs locally

From the repository root:

```powershell
npm --prefix apps/labs-dashboard install
npm --prefix apps/labs-dashboard run dev
```

Open `http://localhost:3000`.

The dashboard loads its ignored configuration from
`apps/labs-dashboard/.env.local`. Copy the required Labs values from the
repository environment when setting up the app; do not commit either file.

Required configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `LABS_ADMIN_SECRET`

Optional AI review configuration:

- `OPENAI_API_KEY`
- `OPENAI_ENRICHMENT_MODEL`

All credentials must target Labs project `csaefdkpwukshtouyixg`. Never use the
production project. Secret values are server-only and must remain in ignored
environment files.

## Log in

Internal routes redirect to `/login`. Enter the local `LABS_ADMIN_SECRET` once.
The server creates a signed, httpOnly 12-hour cookie. Use Settings to sign out.

The public Browse/Passport preview does not use this cookie. It reads only the
safe `public_property_listings` view (publishable Labs key). That view projects
**final effective values** — neighbourhood, property type, and allowlisted
auto-applied attributes — never raw AI proposals, evidence, confidence, tokens,
or costs. The preview remains Labs-only and is not live on merkado.cw.

## Main pages

- **Overview** — inventory, source health, active warnings, and AI review count.
- **Listings** — search and filter all imported listings; switch to Map when
  coordinates exist. Open a listing for source facts, AI review, private
  evidence metadata, and lifecycle history.
- **Sources** — source maturity and inventory. Open a source for run history,
  data quality, and manual adapter configuration.
- **Enrichment** — audit AI cost/usage (gross vs. retained-result vs. wasted
  spend, token totals, model-efficiency comparison across model/prompt/
  schema versions) and review existing AI proposals beside source listings.
  Review is exception-based: high-confidence evidenced fields auto-apply;
  only conflicts, weak evidence, or new-attribute taxonomy need attention,
  and unsupported/noisy proposals never reach the queue. AI execution is
  disabled; proposals never overwrite source facts.
- **Quality** — eligibility, lifecycle states, missing fields, evidence
  availability, and location quality.
- **Settings** — safe configuration health, admin session, disabled schedules,
  and environment boundaries.
- **Prototypes** — Browse/Passport, Search Request, What Fits Me?, Agent, and
  Match Reports. These are explicitly experimental.

## Understand source runs

`success` is meaningful only for a complete catalog. Bounded, truncated, or
partially failed runs are `partial` and must never mark absent listings missing
or removed. Every source remains manual and unscheduled.

Current maturity:

- RE/MAX: working complete manual adapter (220 listings); adapter v0.4.1 active (coordinates 199/220); GPT-5.6 Terra-v3 initial backfill complete (220/220); Data Ops Refresh & enrich still bills new/changed only (initial backfill was a separate one-time approval).
- Keller Williams: complete 84-listing catalog via offline import (the
  live-crawl adapter still has incomplete pagination); GPT-5.6 Terra AI
  enrichment activated — 84/84 successful proposals, manual/unscheduled.
- Moret: Ready (adapter v0.2.0; first complete catalog 71 activated; GPT-5.6 Terra-v3 initial backfill complete 71/71; Refresh & enrich = new/changed only; remains manual/unscheduled).
- Monumentenzorg: Reconnaissance required (public pages reachable again; completeness must be reverified). Not Ready — next active source task.
- Sotheby's: Access route under investigation (approved public route/feed still required). Not Ready.

## Troubleshoot database loading

1. Open Settings and check the five yes/no configuration statuses.
2. Confirm the URL points to `csaefdkpwukshtouyixg`.
3. Restart the dev server after changing environment files.
4. Read the page error category: Configuration, Authentication, Network, or
   Database query.
5. Do not treat a failed query as an empty database; the UI intentionally shows
   an error instead of zero.

## Do not run without approval

- source adapters or listing imports;
- complete-run lifecycle updates;
- AI enrichment jobs;
- schedules or workflows;
- destructive SQL or database resets;
- production Supabase or Vercel operations;
- deployments or pushes.
