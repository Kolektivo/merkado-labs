import assert from "node:assert/strict";
import test from "node:test";

import { parsePropertySearchText } from "../../src/lib/matching/parse-property-search.ts";
import { rankListings, scoreListing } from "../../src/lib/matching/rules-v1.ts";
import {
  matchLabelForScore,
} from "../../src/lib/matching/types.ts";

test("English What Fits Me prompt parses hard and soft criteria", () => {
  const criteria = parsePropertySearchText(
    "I'm looking for a 3-bedroom house around Jan Thiel or Brakkeput, under Cg 850,000, with a pool and parking.",
  );
  assert.equal(criteria.transactionType, "sale");
  assert.equal(criteria.minBedrooms, 3);
  assert.equal(criteria.maxPrice, 850000);
  assert.ok(criteria.preferredNeighbourhoods.includes("Jan Thiel"));
  assert.ok(criteria.preferredNeighbourhoods.includes("Brakkeput"));
  assert.ok(criteria.propertyTypes.includes("house"));
  assert.ok(criteria.preferences.includes("pool"));
  assert.ok(criteria.preferences.includes("parking"));
  assert.equal(criteria.priceCurrency, "XCG");
});

test("Dutch rental prompt parses rent, budget, and amenities", () => {
  const criteria = parsePropertySearchText(
    "Zoek een appartement te huur in Piscadera, maximaal Cg 3500, met airco en parkeerplaats.",
  );
  assert.equal(criteria.transactionType, "rent");
  assert.ok(criteria.propertyTypes.includes("apartment"));
  assert.ok(criteria.preferredNeighbourhoods.includes("Piscadera"));
  assert.equal(criteria.maxPrice, 3500);
  assert.ok(criteria.preferences.includes("air conditioning"));
  assert.ok(criteria.preferences.includes("parking"));
});

test("must-have clause elevates amenities; negation becomes dealbreaker", () => {
  const must = parsePropertySearchText(
    "3 bedroom house under 700000, must have a pool",
  );
  assert.ok(must.mustHaves.includes("pool"));

  const noPool = parsePropertySearchText(
    "2 bedroom apartment under 400000, no pool",
  );
  assert.ok(noPool.dealbreakers.includes("pool"));
});

function listing(overrides = {}) {
  return {
    listingId: "l1",
    externalId: "hs1",
    listingType: "sale",
    propertyType: "villa",
    status: "active",
    publicEligible: true,
    benchmarkPriceXcg: 500000,
    bedrooms: 3,
    bathrooms: 2,
    floorAreaM2: 180,
    neighbourhoodText: "Jan Thiel",
    amenityTokens: ["pool", "parking"],
    title: "Villa with pool",
    sourceDisplayName: "Demo Source",
    primaryImageUrl: null,
    originalPrice: null,
    originalCurrency: null,
    ...overrides,
  };
}

test("hard filters exclude budget, location, beds, and listing type mismatches", () => {
  const request = {
    transactionType: "sale",
    minPrice: null,
    maxPrice: 850000,
    priceCurrency: "XCG",
    minBedrooms: 3,
    minBathrooms: null,
    minFloorAreaM2: null,
    propertyTypes: ["house"],
    preferredNeighbourhoods: ["Jan Thiel"],
    excludedNeighbourhoods: [],
    mustHaves: [],
    preferences: ["pool"],
    dealbreakers: [],
  };

  assert.equal(
    scoreListing(request, listing({ benchmarkPriceXcg: 900000 })).hardPass,
    false,
  );
  assert.equal(
    scoreListing(request, listing({ benchmarkPriceXcg: null })).hardPass,
    false,
  );
  assert.equal(
    scoreListing(request, listing({ neighbourhoodText: "Westpunt" })).hardPass,
    false,
  );
  assert.equal(
    scoreListing(request, listing({ bedrooms: 2 })).hardPass,
    false,
  );
  assert.equal(
    scoreListing(request, listing({ listingType: "rent" })).hardPass,
    false,
  );

  const pass = scoreListing(request, listing());
  assert.equal(pass.hardPass, true);
  assert.ok(pass.matchReasons.some((reason) => /budget|XCG/i.test(reason)));
  assert.equal(matchLabelForScore(pass.matchScore, true) !== null, true);
});

test("amenities are soft preferences and missing data is honest", () => {
  const request = {
    transactionType: "sale",
    minPrice: null,
    maxPrice: 850000,
    priceCurrency: "XCG",
    minBedrooms: 3,
    minBathrooms: null,
    minFloorAreaM2: null,
    propertyTypes: [],
    preferredNeighbourhoods: ["Jan Thiel"],
    excludedNeighbourhoods: [],
    mustHaves: [],
    preferences: ["garden"],
    dealbreakers: [],
  };
  const result = scoreListing(request, listing({ amenityTokens: ["pool"] }));
  assert.equal(result.hardPass, true);
  assert.ok(
    result.tradeOffs.some((item) => /Preference not evidenced: garden/i.test(item)),
  );
});

test("rank returns strongest matches first", () => {
  const request = {
    transactionType: "sale",
    minPrice: null,
    maxPrice: 900000,
    priceCurrency: "XCG",
    minBedrooms: null,
    minBathrooms: null,
    minFloorAreaM2: null,
    propertyTypes: [],
    preferredNeighbourhoods: ["Jan Thiel"],
    excludedNeighbourhoods: [],
    mustHaves: [],
    preferences: ["pool"],
    dealbreakers: [],
  };
  const ranked = rankListings(
    request,
    [
      listing({
        listingId: "a",
        amenityTokens: ["parking"],
        title: "Quiet family home",
      }),
      listing({
        listingId: "b",
        amenityTokens: ["pool", "parking"],
        title: "Home with outdoor living",
      }),
    ],
    5,
  );
  assert.equal(ranked[0].listingId, "b");
  assert.ok(["Strong match", "Good match", "Possible match"].includes(ranked[0].matchLabel));
});
