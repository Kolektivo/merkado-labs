import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveEffectiveNeighbourhood } from "../../src/lib/domain/effective-neighbourhood.ts";
import {
  canonicalizeNeighbourhood,
  neighbourhoodKeysMatch,
} from "../../src/lib/domain/neighbourhood-aliases.ts";

function canonicalOption(sourceName, mapName = null) {
  return resolveEffectiveNeighbourhood({ sourceName, mapName }).name;
}

test("filter options collapse salina and marie spelling variants once", () => {
  const sources = [
    "Salinja",
    "Saliña",
    "Salinja Curacao",
    "Marie Pompoen",
    "Marie Pampoen / Marie Pompoen Curacao",
    "Salinja Abou",
  ];
  const options = Array.from(
    new Set(sources.map((source) => canonicalOption(source)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  assert.deepEqual(
    options.filter((label) => neighbourhoodKeysMatch(label, "Saliña")),
    ["Saliña"],
  );
  assert.deepEqual(
    options.filter((label) => neighbourhoodKeysMatch(label, "Marie Pampoen")),
    ["Marie Pampoen"],
  );
  assert.ok(options.includes("Salinja Abou"));
  assert.equal(options.includes("Salinja"), false);
  assert.equal(options.includes("Marie Pompoen"), false);
});

test("selecting Saliña matches every mapped spelling variant", () => {
  const rows = [
    "Salinja",
    "Saliña",
    "Salinja Curacao",
    "Salinja Abou",
    "Marie Pompoen",
  ];
  const matched = rows.filter((source) =>
    neighbourhoodKeysMatch(canonicalOption(source), "Saliña"),
  );
  assert.deepEqual(matched, ["Salinja", "Saliña", "Salinja Curacao"]);
});

test("browse and listings analytics use canonical neighbourhood matching", () => {
  const analytics = readFileSync(
    new URL("../../src/lib/data/analytics.ts", import.meta.url),
    "utf8",
  );
  const browse = readFileSync(
    new URL("../../src/app/browse/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(analytics, /neighbourhoodKeysMatch/);
  assert.match(analytics, /listingCanonicalNeighbourhood/);
  assert.match(analytics, /markerCanonicalNeighbourhood/);
  assert.doesNotMatch(
    analytics,
    /listing\.neighbourhood\?\.id === filters\.neighbourhood/,
  );
  assert.match(browse, /neighbourhoodKeysMatch/);
  assert.match(browse, /canonicalizeNeighbourhood/);
});

test("canonical display keeps source evidence distinct from filter label", () => {
  const result = canonicalizeNeighbourhood("Salinja Curacao");
  assert.equal(result.original, "Salinja Curacao");
  assert.equal(result.canonicalDisplay, "Saliña");
  assert.equal(result.reason, "exact_alias");
});
