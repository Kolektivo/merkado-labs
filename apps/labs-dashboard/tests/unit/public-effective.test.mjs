import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  groupPublicAttributes,
  isPositivePublicAttribute,
  listingHasPublicAttribute,
  normalizePublicAttributes,
  PUBLIC_ATTRIBUTE_FILTER_KEYS,
  PUBLIC_NEIGHBOURHOOD_PROVENANCE_LABELS,
} from "../../src/lib/domain/public-attributes.ts";
import {
  isGenericNeighbourhood,
  resolveEffectiveNeighbourhood,
} from "../../src/lib/domain/effective-neighbourhood.ts";

test("unknown attributes are not exposed publicly", () => {
  const attrs = normalizePublicAttributes([
    { key: "furnished", value: true, value_type: "boolean" },
    { key: "helicopter_pad", value: true, value_type: "boolean" },
    { key: "pool", value: "unknown", value_type: "boolean" },
  ]);
  assert.deepEqual(
    attrs.map((item) => item.key),
    ["furnished"],
  );
});

test("needs-attention shaped values without allowlist still normalize safely", () => {
  const attrs = normalizePublicAttributes([
    {
      key: "gated_community",
      value: true,
      display_label: "Gated community",
      value_type: "boolean",
    },
  ]);
  assert.equal(attrs.length, 1);
  assert.equal(attrs[0].displayLabel, "Gated community");
  assert.equal("confidence" in attrs[0], false);
});

test("empty feature groups are omitted", () => {
  const groups = groupPublicAttributes([
    {
      key: "pool",
      displayLabel: "Pool",
      value: true,
      valueType: "boolean",
    },
  ]);
  assert.deepEqual(
    groups.map((group) => group.id),
    ["outdoor"],
  );
});

test("generic Curacao is not a neighbourhood", () => {
  assert.equal(isGenericNeighbourhood("Curaçao"), true);
  const effective = resolveEffectiveNeighbourhood({
    sourceName: "Curaçao",
    mapName: null,
  });
  assert.equal(effective.name, null);
});

test("source neighbourhood wins over map and AI for public cards", () => {
  const effective = resolveEffectiveNeighbourhood({
    sourceName: "Jan Thiel",
    mapName: "Mambo Beach",
    aiCandidateName: "Mambo Beach",
    aiCandidateConfidence: 0.99,
  });
  assert.equal(effective.name, "Jan Thiel");
  assert.equal(
    PUBLIC_NEIGHBOURHOOD_PROVENANCE_LABELS.source,
    "From source",
  );
});

test("attribute filters use positive effective values", () => {
  const attrs = normalizePublicAttributes([
    { key: "parking", value: true },
    { key: "furnished", value: false },
  ]);
  const parking = attrs.find((item) => item.key === "parking");
  const furnished = attrs.find((item) => item.key === "furnished");
  assert.equal(listingHasPublicAttribute(attrs, "parking"), true);
  assert.equal(listingHasPublicAttribute(attrs, "furnished"), false);
  assert.equal(isPositivePublicAttribute(parking), true);
  assert.equal(isPositivePublicAttribute(furnished), false);
  assert.ok(PUBLIC_ATTRIBUTE_FILTER_KEYS.includes("air_conditioning"));
  assert.ok(!PUBLIC_ATTRIBUTE_FILTER_KEYS.includes("pool"));
});

test("browse and passport share the public attribute module", () => {
  const browse = readFileSync(
    new URL("../../src/app/browse/page.tsx", import.meta.url),
    "utf8",
  );
  const passport = readFileSync(
    new URL("../../src/app/browse/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  const publicListings = readFileSync(
    new URL("../../src/lib/data/public-listings.ts", import.meta.url),
    "utf8",
  );
  assert.match(browse, /effectiveNeighbourhood/);
  assert.match(browse, /publicAttributes/);
  assert.match(browse, /benchmarkPriceXcg/);
  assert.match(passport, /groupPublicAttributes/);
  assert.match(passport, /effectiveNeighbourhoodProvenanceLabel/);
  assert.match(passport, /effectiveSummary/);
  assert.match(publicListings, /createReadOnlySupabaseClient/);
  assert.match(publicListings, /public_property_listings/);
  assert.doesNotMatch(publicListings, /ai_enrichment_proposals/);
  assert.doesNotMatch(browse, /confidence/);
  assert.doesNotMatch(passport, /token_usage|supporting_evidence|field_decisions/);
});

test("public listings fail safe when effective columns are absent", () => {
  const source = readFileSync(
    new URL("../../src/lib/data/public-listings.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /isMissingEffectiveColumnError/);
  assert.match(source, /PUBLIC_SELECT_BASIC/);
  assert.match(source, /Pre-migration rollout: serve basic public fields safely/);
});

test("normalizePublicListing treats missing effective columns as empty", () => {
  const source = readFileSync(
    new URL("../../src/lib/data/public-listings.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /normalizeProvenance/);
  assert.match(
    source,
    /publicAttributes: normalizePublicAttributes\(row\.public_attributes\)/,
  );
  assert.match(source, /effectiveNeighbourhood: neighbourhood/);
  // Missing provenance defaults to unavailable rather than inventing Curaçao.
  assert.match(source, /return "unavailable"/);
  const attrs = normalizePublicAttributes(undefined);
  assert.deepEqual(attrs, []);
});
