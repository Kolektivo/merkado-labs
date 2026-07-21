import assert from "node:assert/strict";
import test from "node:test";

import {
  listingHasMapGap,
  listingHasNeighbourhoodSearchGap,
} from "../../src/lib/domain/location-gaps.ts";
import { canonicalizeNeighbourhood } from "../../src/lib/domain/neighbourhood-aliases.ts";

test("map gap is missing lat/lng only", () => {
  assert.equal(
    listingHasMapGap({ latitude: null, longitude: null }),
    true,
  );
  assert.equal(
    listingHasMapGap({ latitude: 12.1, longitude: null }),
    true,
  );
  assert.equal(
    listingHasMapGap({ latitude: 12.1, longitude: -68.9 }),
    false,
  );
});

test("map gap with source neighbourhood is still map-only, not search gap", () => {
  const listing = {
    latitude: null,
    longitude: null,
    sourceNeighbourhoodText: "Jan Thiel",
    inferredNeighbourhood: null,
  };
  assert.equal(listingHasMapGap(listing), true);
  assert.equal(listingHasNeighbourhoodSearchGap(listing), false);
});

test("neighbourhood search gap when no source and no map area", () => {
  assert.equal(
    listingHasNeighbourhoodSearchGap({
      latitude: 12.1,
      longitude: -68.9,
      sourceNeighbourhoodText: null,
      inferredNeighbourhood: null,
    }),
    true,
  );
});

test("generic source alone is a neighbourhood search gap without map", () => {
  assert.equal(
    listingHasNeighbourhoodSearchGap({
      latitude: null,
      longitude: null,
      sourceNeighbourhoodText: "Curaçao",
      inferredNeighbourhood: null,
    }),
    true,
  );
});

test("map polygon fills neighbourhood search when source is missing", () => {
  assert.equal(
    listingHasNeighbourhoodSearchGap({
      latitude: 12.1,
      longitude: -68.9,
      sourceNeighbourhoodText: null,
      inferredNeighbourhood: { name: "Mambo Beach" },
    }),
    false,
  );
});

test("source present but only needing alias cleanup is not a search gap", () => {
  const source = "Jan Thiel Curacao";
  assert.equal(canonicalizeNeighbourhood(source).canonicalDisplay, "Jan Thiel");
  assert.equal(
    listingHasNeighbourhoodSearchGap({
      latitude: null,
      longitude: null,
      sourceNeighbourhoodText: source,
      inferredNeighbourhood: null,
    }),
    false,
  );
});

test("Vista Royal and Jan Thiel stay distinct; combined is uncertain not merged", () => {
  assert.equal(
    canonicalizeNeighbourhood("Vista Royal").canonicalDisplay,
    "Vista Royal",
  );
  assert.equal(
    canonicalizeNeighbourhood("Jan Thiel").canonicalDisplay,
    "Jan Thiel",
  );
  const combined = canonicalizeNeighbourhood("Vista Royal / Jan Thiel");
  assert.equal(combined.reason, "uncertain");
  assert.equal(combined.safe, false);
  assert.equal(combined.canonicalDisplay, "Vista Royal / Jan Thiel");
  // Uncertain multi-place labels are not auto-merged into Jan Thiel / Vista Royal.
  assert.notEqual(combined.canonicalDisplay, "Jan Thiel");
  assert.notEqual(combined.canonicalDisplay, "Vista Royal");
});

test("Blue Bay and Sint Joris aliases remain searchable", () => {
  assert.equal(
    listingHasNeighbourhoodSearchGap({
      latitude: null,
      longitude: null,
      sourceNeighbourhoodText: "Blue Bay Golf & Beach Resort",
      inferredNeighbourhood: null,
    }),
    false,
  );
  assert.equal(
    listingHasNeighbourhoodSearchGap({
      latitude: null,
      longitude: null,
      sourceNeighbourhoodText: "St. Joris",
      inferredNeighbourhood: null,
    }),
    false,
  );
});

test("Brakkeput Abou is not merged away as a search gap", () => {
  assert.equal(
    canonicalizeNeighbourhood("Brakkeput Abou").canonicalDisplay,
    "Brakkeput Abou",
  );
  assert.equal(
    listingHasNeighbourhoodSearchGap({
      latitude: null,
      longitude: null,
      sourceNeighbourhoodText: "Brakkeput Abou",
      inferredNeighbourhood: null,
    }),
    false,
  );
});
