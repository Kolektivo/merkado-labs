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
  assert.doesNotMatch(
    publicQueries,
    /createLabsAdminClient|\.from\("property_listings"\)/,
  );
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
    "src/app/api/agent/entitlements/route.ts",
    "src/app/api/enrichment/preview/route.ts",
    "src/app/api/enrichment/jobs/route.ts",
    "src/app/api/enrichment/proposals/[id]/review/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /assertLabsAdminSession/);
    assert.doesNotMatch(route, /readAdminSecretFromBody/);
  }
});

test("navigation exposes only consolidated top-level areas", () => {
  const shell = source("src/components/app-shell.tsx");
  for (const href of [
    "/",
    "/listings",
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
