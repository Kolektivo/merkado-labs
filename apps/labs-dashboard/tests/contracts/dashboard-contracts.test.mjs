import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("public listing queries use only the safe view and anon client", () => {
  const publicQueries = source("src/lib/data/public-listings.ts");
  assert.match(publicQueries, /createReadOnlySupabaseClient/);
  assert.match(publicQueries, /\.from\("public_property_listings"\)/);
  assert.match(publicQueries, /effective_neighbourhood|PUBLIC_SELECT_BASIC/);
  assert.match(publicQueries, /normalizePublicAttributes|publicAttributes/);
  assert.doesNotMatch(
    publicQueries,
    /createLabsAdminClient|\.from\("property_listings"\)|\.from\("ai_enrichment_proposals"\)/,
  );
});

test("public browse and passport use effective public fields without AI internals", () => {
  const browse = source("src/app/browse/page.tsx");
  const passport = source("src/app/browse/[id]/page.tsx");
  assert.match(browse, /effectiveNeighbourhood/);
  assert.match(browse, /minPrice/);
  assert.match(browse, /benchmarkPriceXcg/);
  assert.match(browse, /listingOrigin === "manual"|User provided/);
  assert.match(passport, /Property features/);
  assert.match(passport, /Source description|User provided/);
  assert.match(passport, /AboutPropertyDescription/);
  assert.match(passport, /resolvePublicDisplayTitle|displayTitle/);
  assert.match(passport, /resolvePublicDisplaySummary|displaySummary/);
  assert.match(passport, /buildPublicListingJsonLd|application\/ld\+json/);
  assert.match(passport, /listingOrigin === "manual"/);
  assert.match(passport, /getPublicListingActivityEvents/);
  assert.match(passport, /filterDefaultTimeline/);
  assert.match(passport, /activityPriceDelta/);
  assert.doesNotMatch(browse, /field_decisions|token_usage|supporting_evidence/);
  assert.doesNotMatch(passport, /field_decisions|token_usage|supporting_evidence/);
  assert.doesNotMatch(passport, /event\.notes/);
});

test("native listing APIs require Labs admin session cookie", () => {
  for (const path of [
    "src/app/api/native-listings/route.ts",
    "src/app/api/native-listings/[id]/route.ts",
    "src/app/api/native-listings/[id]/actions/route.ts",
    "src/app/api/native-listings/[id]/images/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /assertLabsAdminSession/);
    assert.doesNotMatch(route, /readAdminSecretFromBody/);
  }
});

test("listings inventory exposes Add property entry point", () => {
  const listings = source("src/app/listings/page.tsx");
  assert.match(listings, /\/listings\/new/);
  assert.match(listings, /Add property/);
});

test("internal routes use one signed-cookie proxy gate", () => {
  const proxy = source("src/proxy.ts");
  assert.match(proxy, /verifyLabsAdminSessionToken/);
  assert.match(proxy, /new URL\("\/login"/);
  assert.match(proxy, /"\/browse"/);
  assert.match(proxy, /"\/api\/admin\/login"/);
});

test("normal admin APIs require the session cookie, not repeated secrets", () => {
  for (const path of [
    "src/app/api/search-requests/route.ts",
    "src/app/api/search-requests/[id]/route.ts",
    "src/app/api/search-requests/[id]/confirm/route.ts",
    "src/app/api/agent/entitlements/route.ts",
    "src/app/api/enrichment/preview/route.ts",
    "src/app/api/enrichment/jobs/route.ts",
    "src/app/api/enrichment/proposals/[id]/review/route.ts",
    "src/app/api/pipeline/runs/route.ts",
    "src/app/api/pipeline/runs/[id]/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /assertLabsAdminSession/);
    assert.doesNotMatch(route, /readAdminSecretFromBody/);
  }
});

test("What Fits Me handoff supports criteria review, edit, and confirmation", () => {
  const form = source("src/components/search-request-form.tsx");
  const review = source("src/components/search-request-review.tsx");
  const report = source("src/app/match-reports/[requestId]/page.tsx");
  const updateRoute = source("src/app/api/search-requests/[id]/route.ts");

  assert.match(form, /intakeSource: guided \? "what_fits_me"/);
  assert.match(form, /router\.push\(`\/match-reports\/\$\{result\.id\}`\)/);
  assert.match(report, /SearchRequestReview/);
  assert.match(report, /ConfirmSearchRequestButton/);
  assert.match(review, /Review property search criteria/);
  assert.match(review, /Edit search/);
  assert.match(updateRoute, /status: "draft"/);
  assert.match(updateRoute, /confirmed_at: null/);
});

test("navigation exposes only consolidated top-level areas", () => {
  const shell = source("src/components/app-shell.tsx");
  for (const href of [
    "/",
    "/listings",
    "/data-operations",
    "/sources",
    "/enrichment",
    "/quality",
    "/settings",
    "/prototypes",
  ]) {
    assert.match(shell, new RegExp(`href: "${href.replaceAll("/", "\\/")}"`));
  }
  for (const obsolete of [
    "/source-runs",
    "/eligibility",
    "/lifecycle",
    "/data-quality",
    "/map",
    "/neighbourhoods",
    "/realtors",
    "/how-it-works",
  ]) {
    assert.doesNotMatch(shell, new RegExp(`href: "${obsolete}"`));
  }
});

test("query errors render an explicit retry state rather than zero", () => {
  const error = source("src/components/data-error.tsx");
  assert.match(error, /Configuration/);
  assert.match(error, /Authentication/);
  assert.match(error, /Network/);
  assert.match(error, /Database query/);
  assert.match(error, /Try again/);
  assert.doesNotMatch(error, /return 0/);
});

test("listing breadcrumbs preserve section context from enrichment and match reports", () => {
  const crumbs = source("src/lib/breadcrumbs.ts");
  const enrichment = source("src/app/enrichment/page.tsx");
  const matchReports = source("src/app/match-reports/[requestId]/page.tsx");
  const listingDetail = source("src/app/listings/[id]/page.tsx");
  const shell = source("src/components/app-shell.tsx");

  assert.match(crumbs, /from:\s*"enrichment"|enrichment:\s*\{/);
  assert.match(crumbs, /listingDetailHref/);
  assert.match(crumbs, /resolveListingBackNav/);
  assert.match(enrichment, /from:\s*"enrichment"/);
  assert.match(matchReports, /from:\s*"match-reports"/);
  assert.match(listingDetail, /resolveListingBackNav/);
  assert.match(shell, /resolveCrumbs/);
  assert.match(shell, /useSearchParams/);
});

test("AI cost math lives in one shared module and never converts to XCG", () => {
  const cost = source("src/lib/enrichment/cost.ts");
  assert.match(cost, /export function calculateUsageCostUsd/);
  assert.match(cost, /export const MODEL_RATES_USD_PER_1M/);
  assert.match(cost, /"gpt-5\.6-terra":\s*\{\s*input:\s*2\.5,\s*cachedInput:\s*0\.25,\s*output:\s*15/);
  assert.match(
    cost,
    /Estimated from recorded token usage and configured model pricing\./,
  );
  assert.doesNotMatch(cost, /benchmarkPriceXcg|formatXcgPrimary|xcg_rate|toXcg/i);
});

test("enrichment dashboard derives cost, run history, and model efficiency from stored jobs/proposals", () => {
  const enrichment = source("src/lib/data/enrichment.ts");
  assert.match(enrichment, /export function buildEnrichmentCostSummary/);
  assert.match(enrichment, /export function buildModelEfficiencyRows/);
  assert.match(enrichment, /export function buildEnrichmentRunRows/);
  assert.match(enrichment, /loadAllAiEnrichmentAttempts/);
  // No live OpenAI calls from the dashboard.
  assert.doesNotMatch(enrichment, /openai|OPENAI/);

  const page = source("src/app/enrichment/page.tsx");
  assert.match(page, /costSummary/);
  assert.match(page, /runRows/);
  assert.match(page, /modelEfficiency/);
  assert.match(page, /not directly comparable/);
});

test("listing detail surfaces cumulative AI usage and cost alongside changes", () => {
  const changes = source("src/components/listing-ai-changes.tsx");
  assert.match(changes, /Cumulative attempts/);
  assert.match(changes, /Cumulative estimated cost/);
  assert.match(changes, /Current run tokens . cost/);
});

test("prototype and server-only configuration boundaries stay explicit", () => {
  const notice = source("src/components/prototype-notice.tsx");
  const config = source("src/lib/supabase/config.ts");
  const admin = source("src/lib/supabase/admin.ts");
  assert.match(notice, /not live on merkado\.cw/);
  assert.match(config, /import "server-only"/);
  assert.match(admin, /import "server-only"/);
  assert.match(config, /csaefdkpwukshtouyixg/);
  assert.doesNotMatch(admin, /NEXT_PUBLIC_SUPABASE_SERVICE|NEXT_PUBLIC_SUPABASE_SECRET/);
});

test("public-effective migration projects allowlisted fields only", () => {
  const migration = readFileSync(
    new URL(
      "../../../../supabase/migrations/20260720140000_public_property_listings_effective.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /effective_neighbourhood/);
  assert.match(migration, /public_attributes/);
  assert.match(migration, /grant select on table public\.public_property_listings/);
  assert.match(migration, /revoke all on table public\.public_property_listings/);
  assert.match(migration, /security_invoker = false/);
  assert.match(migration, /listing_enrichment_v3/);
  assert.match(migration, /distinct on \(pl\.id\)/);
  assert.match(migration, /distinct on \(canon_key\)/);
  assert.doesNotMatch(migration, /supporting_evidence/);
  assert.doesNotMatch(migration, /token_usage/);
  assert.doesNotMatch(migration, /cost_usd/);
});

test("v4 public-effective migration prefers v4 and adds display_description", () => {
  const migration = readFileSync(
    new URL(
      "../../../../supabase/migrations/20260720180000_enrichment_quality_v4_public_effective.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /listing_enrichment_v4/);
  assert.match(migration, /listing_enrichment_v3/);
  assert.match(migration, /display_description/);
  assert.match(migration, /security_invoker = false/);
  assert.match(migration, /public_property_listings_v3_projection/);
  assert.doesNotMatch(migration, /supporting_evidence/);
  assert.doesNotMatch(migration, /token_usage/);
});

test("v5 english presentation migration prefers v5 and exposes display_title", () => {
  const migration = readFileSync(
    new URL(
      "../../../../supabase/migrations/20260721131309_english_presentation_public_effective.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /listing_enrichment_v5/);
  assert.match(migration, /listing_enrichment_v4/);
  assert.match(migration, /listing_enrichment_v3/);
  assert.match(migration, /display_title/);
  assert.match(migration, /display_summary/);
  assert.match(migration, /display_description/);
  assert.match(migration, /security_invoker = false/);
  assert.doesNotMatch(migration, /supporting_evidence/);
  assert.doesNotMatch(migration, /token_usage/);
});

test("bilingual migration adds Dutch locales table and display_description_nl", () => {
  const migration = readFileSync(
    new URL(
      "../../../../supabase/migrations/20260721155626_bilingual_display_descriptions.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /listing_display_description_locales/);
  assert.match(migration, /display_description_nl/);
  assert.match(migration, /presentation_input_hash/);
  assert.match(migration, /locale = 'nl'/);
  assert.match(migration, /security_invoker = false/);
  assert.doesNotMatch(migration, /supporting_evidence/);
});
