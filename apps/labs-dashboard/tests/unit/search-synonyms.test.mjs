import assert from "node:assert/strict";
import test from "node:test";

import {
  expandSearchTerms,
  matchesSynonymSearch,
  SEARCH_SYNONYM_GROUPS,
} from "../../src/lib/search/synonyms.ts";

test("synonym groups cover core Dutch↔English property terms", () => {
  const flat = SEARCH_SYNONYM_GROUPS.flat().map((term) => term.toLowerCase());
  for (const required of [
    "furnished",
    "gemeubileerd",
    "pool",
    "zwembad",
    "detached",
    "vrijstaand",
    "apartment",
    "appartement",
    "sale",
    "koop",
    "rent",
    "huur",
  ]) {
    assert.ok(flat.includes(required), `missing synonym: ${required}`);
  }
});

test("expandSearchTerms adds peer synonyms for Dutch query", () => {
  const terms = expandSearchTerms("gemeubileerd");
  assert.ok(terms.includes("gemeubileerd"));
  assert.ok(terms.includes("furnished"));
});

test("expandSearchTerms adds peer synonyms for English query", () => {
  const terms = expandSearchTerms("pool");
  assert.ok(terms.includes("pool"));
  assert.ok(terms.includes("zwembad"));
});

test("expandSearchTerms handles multi-word phrases", () => {
  const terms = expandSearchTerms("te koop");
  assert.ok(terms.includes("te koop"));
  assert.ok(terms.includes("sale") || terms.includes("for sale"));
});

test("Dutch query matches English public copy via synonyms", () => {
  assert.equal(
    matchesSynonymSearch(
      ["3-Bedroom furnished villa in Jan Thiel", "Private pool"],
      "gemeubileerd",
    ),
    true,
  );
  assert.equal(
    matchesSynonymSearch(
      ["Modern apartment with sea view"],
      "appartement",
    ),
    true,
  );
  assert.equal(
    matchesSynonymSearch(["Detached house for sale"], "vrijstaand"),
    true,
  );
  assert.equal(
    matchesSynonymSearch(["Bright home with garden"], "zwembad"),
    false,
  );
});

test("English query still matches residual Dutch source text", () => {
  assert.equal(
    matchesSynonymSearch(
      ["Prachtige gemeubileerde woning met zwembad"],
      "furnished pool",
    ),
    true,
  );
});

test("empty query matches everything", () => {
  assert.equal(matchesSynonymSearch(["anything"], ""), true);
  assert.equal(matchesSynonymSearch([], "   "), true);
});
