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

Optional GitHub dispatch (Data Operations → Run now):

- `GITHUB_REPOSITORY`
- fine-grained `GITHUB_TOKEN` (server-only)

All credentials must target Labs project `csaefdkpwukshtouyixg`. Never use the
production project. Secret values are server-only and must remain in ignored
environment files.

## Log in

Internal routes redirect to `/login`. Enter the local `LABS_ADMIN_SECRET` once.
The server creates a signed, httpOnly 12-hour cookie. Use Settings to sign out.

The public Browse/Passport preview does not use this cookie. It reads only the
safe `public_property_listings` view (publishable Labs key). That view projects
**final effective values** — English `display_title` / `display_summary` when
present (else deterministic English fallbacks), English `display_description`,
optional Dutch `display_description_nl` for About this property, neighbourhood,
property type, allowlisted auto-applied attributes, and image galleries —
never raw AI proposals, evidence, confidence, tokens, or costs. English is the
default public UI language; About this property can toggle English/Nederlands
client-side without URL changes. Stable URLs are `/browse/{uuid}`. SEO/JSON-LD
use English presentation + XCG when available. Raw source title/description
remain preserved. Gallery URLs are deduped at ingestion (`build_gallery`) and
again in the UI (`listing-gallery-urls.ts`). The preview remains Labs-only and
is not live on merkado.cw.

## Main pages

- **Overview** — inventory, source health, active warnings, and AI review count.
- **Listings** — search and filter all imported listings; switch to Map when
  coordinates exist. Open a listing for source facts, AI review, private
  evidence metadata, and lifecycle history. **Add property** opens the Labs
  admin native listing wizard (`/listings/new`): draft → features → photos →
  Browse-card + Property-Passport review → publish. Photos can be reordered,
  promoted to cover, or removed before publishing; lifecycle controls only show
  transitions valid for the current status. Edit at `/listings/[id]/edit`.
  Native rows use
  `listing_origin=manual`, never require a scraper URL, and do not run through
  the property pipeline or AI enrichment automatically.
- **Sources** — source maturity and inventory. Open a source for run history,
  data quality, and manual adapter configuration.
- **Enrichment** — audit AI cost/usage (gross vs. retained-result vs. wasted
  spend, token totals, model-efficiency comparison across model/prompt/
  schema versions) and review existing AI proposals beside source listings.
  Current versions are **v5 / policy v5** (English public presentation).
  Review is exception-based: high-confidence evidenced fields auto-apply;
  only genuine conflicts, weak evidence, or new-attribute taxonomy need
  attention; style/translation choices do not; unsupported/noisy proposals
  never reach the queue. AI execution is disabled; proposals never overwrite
  source facts or raw source title/description.
- **Quality** — eligibility, lifecycle states, missing fields, evidence
  availability, and location quality.
- **Data operations** — Labs-only property pipeline enqueue/dispatch for the
  four Ready sources. Approved Labs path when admin session + server credentials
  are present. Still no production Supabase/Vercel access and no deploy from
  this surface.
- **Settings** — safe configuration health, admin session, **Automatic refresh
  On**, daily cron `0 4 * * *` UTC = 00:00 Curaçao (06:00 Amsterdam during
  CEST / 05:00 Amsterdam during CET; begins when the Labs workflow reaches the
  default branch), and environment boundaries.
- **Browse** — under Explore / **Public preview**. Passport detail uses
  XCG-primary pricing and the filtered seller/source/native timeline; ±1
  display jitter, benchmark-only FX, AI/ops/repair and duplicate noise remain
  stored but are not presented.
- **Prototypes** — Search Request, What Fits Me?, Agent, and Match Reports.
  These are explicitly experimental. What Fits Me can create a draft, the
  criteria can be reviewed/edited, and the request can be explicitly
  confirmed. No real subscription, billing, paywall, entitlement enforcement,
  continuous monitoring, or email exists.

Data Operations can enqueue and dispatch the Labs-only property workflow when
admin + credentials are configured. **Automatic refresh is On**
(`AUTOMATIC_REFRESH_ENABLED = true`) after 2026-07-21 supervised + idempotent
gates; GHA schedule `0 4 * * *` UTC begins only on the default branch. Manual
Run still uses `workflow_dispatch` when server-only `GITHUB_REPOSITORY` and a
dedicated fine-grained `GITHUB_TOKEN` are set. The workflow enforces USD 2
daily / USD 25 monthly / 25-listing AI limits, and excludes blocked Sotheby's.
One-time English presentation migration **applied** for **289** listings
(~USD 7.83); Dutch description backfill **applied** for **285** (~USD 2.42);
unchanged bilingual hashes skip at zero cost.

## Understand source runs

`success` is meaningful only for a complete catalog. Bounded, truncated, or
partially failed runs are `partial` and must never mark absent listings missing
or removed. Manual dispatch and daily schedule share the Labs orchestrator path.

Current maturity:

- RE/MAX: Ready adapter v0.4.1; catalog contract 220 (Labs audit 223; live
  discover ~220); Terra coverage complete; pipeline ready / cron On; Refresh &
  enrich bills new/changed only.
- Keller Williams: Ready adapter v0.3.1; Labs audit 105; live discover ~102;
  marketing non-listing URLs excluded; Terra v5 / policy v5; cron On.
- Moret: Ready (adapter v0.2.0; catalog contract 71 / Labs audit 72; cron On).
- Monumentenzorg: Ready (adapter v0.2.0; 5 listings; cron On).
- Sotheby's: Access route BLOCKED (2026-07-20 recon — affiliate TLS broken;
  network HTTP 202 WAF; app.sir.com office shell has no catalog). Official
  feed/partner API required. Not Ready; excluded from Ready pipelines.

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
- schedules or workflows (including changing or disabling the active cron);
- destructive SQL or database resets;
- production Supabase or Vercel operations;
- deployments or pushes.
