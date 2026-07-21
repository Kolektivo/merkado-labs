import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFallbackDisplayTitle,
  publicListingTypeLabel,
  resolvePublicDisplaySummary,
  resolvePublicDisplayTitle,
  resolvePublicMetaDescription,
  truncatePublicSummary,
} from "../../src/lib/domain/public-presentation.ts";

test("display title prefers AI field over deterministic fallback", () => {
  const title = resolvePublicDisplayTitle({
    displayTitle: "3-Bedroom Villa with Pool in Jan Thiel",
    title: "Prachtige villa te koop",
    bedrooms: 3,
    propertyType: "villa",
    effectiveNeighbourhood: "Jan Thiel",
  });
  assert.equal(title, "3-Bedroom Villa with Pool in Jan Thiel");
});

test("deterministic title never uses raw Dutch source title", () => {
  const title = resolvePublicDisplayTitle({
    title: "Prachtige gemeubileerde woning te koop",
    bedrooms: 4,
    effectivePropertyType: "house",
    effectiveNeighbourhood: "Mambo Beach",
  });
  assert.equal(title, "4-Bedroom House in Mambo Beach");
  assert.doesNotMatch(title, /gemeubileerde|te koop|Prachtige/i);
});

test("title fallback chain ends in English generic never blank", () => {
  assert.equal(resolvePublicDisplayTitle({}), "Property listing");
  assert.equal(
    resolvePublicDisplayTitle({ listingType: "sale" }),
    "Property for sale",
  );
  assert.equal(
    resolvePublicDisplayTitle({ effectiveNeighbourhood: "Blue Bay" }),
    "Property in Blue Bay",
  );
  assert.equal(
    buildFallbackDisplayTitle({ externalId: "post-123" }),
    "Property post-123",
  );
});

test("summary prefers displaySummary then effectiveSummary then overview", () => {
  assert.equal(
    resolvePublicDisplaySummary({
      displaySummary: "English AI summary for the listing.",
      effectiveSummary: "Legacy summary",
      displayDescription: { overview: "Overview text" },
    }),
    "English AI summary for the listing.",
  );
  assert.equal(
    resolvePublicDisplaySummary({
      effectiveSummary: "Legacy summary",
      displayDescription: { overview: "Overview text" },
    }),
    "Legacy summary",
  );
  assert.equal(
    resolvePublicDisplaySummary({
      displayDescription: { overview: "Overview text about the home." },
    }),
    "Overview text about the home.",
  );
});

test("meta description always returns English copy", () => {
  const meta = resolvePublicMetaDescription({
    bedrooms: 2,
    propertyType: "apartment",
    effectiveNeighbourhood: "Pietermaai",
    listingType: "rent",
  });
  assert.match(meta, /apartment/i);
  assert.match(meta, /Pietermaai/);
  assert.match(meta, /Curaçao|rent/i);
  assert.ok(meta.length > 0);
});

test("truncatePublicSummary keeps length bound and ends with ellipsis", () => {
  const long =
    "Spacious villa with a private pool and sea views near the beach club area of Jan Thiel on Curacao island.";
  const truncated = truncatePublicSummary(long, 60);
  assert.ok(truncated.length <= 60);
  assert.match(truncated, /…$/);
  assert.ok(!truncated.includes("Curacao island"));
});

test("public listing type labels are English", () => {
  assert.equal(publicListingTypeLabel("sale"), "For sale");
  assert.equal(publicListingTypeLabel("rent"), "For rent");
  assert.equal(publicListingTypeLabel(null), "Listing");
});
