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
safe `public_property_listings` view.

## Main pages

- **Overview** — inventory, source health, active warnings, and AI review count.
- **Listings** — search and filter all imported listings; switch to Map when
  coordinates exist. Open a listing for source facts, AI review, private
  evidence metadata, and lifecycle history.
- **Sources** — source maturity and inventory. Open a source for run history,
  data quality, and manual adapter configuration.
- **Enrichment** — review existing AI proposals beside source listings. AI
  execution is disabled; proposals never overwrite source facts.
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

- RE/MAX: working complete manual adapter.
- Keller Williams: partial adapter; incomplete pagination.
- Moret: partial five-listing sample.
- Monumentenzorg: blocked live source; fixture parser only.
- Sotheby's: blocked by WAF; skeleton/recon only.

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
