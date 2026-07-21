import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AI_NEIGHBOURHOOD_CONFIDENCE_THRESHOLD,
  isGenericNeighbourhood,
  resolveEffectiveNeighbourhood,
} from "../../src/lib/domain/effective-neighbourhood.ts";
import {
  canonicalizeNeighbourhood,
  neighbourhoodKeysMatch,
  normalizeNeighbourhoodKey,
} from "../../src/lib/domain/neighbourhood-aliases.ts";
import {
  INDICATIVE_PRICE_TIP,
  buildPriceDisplay,
  formatXcgPrimary,
} from "../../src/lib/domain/price-display.ts";
import {
  decisionStatusLabel,
  humanizeReasonCode,
  isOperationalAttentionDecision,
} from "../../src/lib/enrichment/display.ts";

test("specific source neighbourhood wins over map and AI", () => {
  const effective = resolveEffectiveNeighbourhood({
    sourceName: "Jan Thiel",
    mapName: "Mambo Beach",
    aiCandidateName: "Mambo Beach",
    aiCandidateConfidence: 0.99,
  });
  assert.equal(effective.name, "Jan Thiel");
  assert.equal(effective.provenance, "source");
  assert.equal(effective.conflict, true);
});

test("listing table prefers raw source neighbourhood text", () => {
  const table = readFileSync(
    new URL("../../src/components/listing-table.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    table,
    /sourceName:\s*listing\.sourceNeighbourhoodText \?\? listing\.neighbourhood\?\.name \?\? null/,
  );
});

test("generic source falls through to a valid map assignment", () => {
  const effective = resolveEffectiveNeighbourhood({
    sourceName: "Curaçao",
    mapName: "Jan Thiel",
  });
  assert.equal(effective.name, "Jan Thiel");
  assert.equal(effective.provenance, "map");
  assert.equal(effective.conflict, false);
});

test("missing source and map falls back to a high-confidence AI candidate", () => {
  const effective = resolveEffectiveNeighbourhood({
    aiCandidateName: "Mambo Beach",
    aiCandidateConfidence: AI_NEIGHBOURHOOD_CONFIDENCE_THRESHOLD,
  });
  assert.equal(effective.name, "Mambo Beach");
  assert.equal(effective.provenance, "ai_extracted");
});

test("low-confidence AI candidate is not used", () => {
  const effective = resolveEffectiveNeighbourhood({
    aiCandidateName: "Mambo Beach",
    aiCandidateConfidence: 0.5,
  });
  assert.equal(effective.name, null);
  assert.equal(effective.provenance, "unavailable");
});

test("ungrounded AI candidate is not used even with high confidence", () => {
  const effective = resolveEffectiveNeighbourhood({
    aiCandidateName: "Mambo Beach",
    aiCandidateConfidence: 0.99,
    aiEvidenceGrounded: false,
  });
  assert.equal(effective.name, null);
  assert.equal(effective.provenance, "unavailable");
});

test("map always wins over a conflicting AI candidate", () => {
  const effective = resolveEffectiveNeighbourhood({
    mapName: "Jan Thiel",
    aiCandidateName: "Mambo Beach",
    aiCandidateConfidence: 0.99,
  });
  assert.equal(effective.name, "Jan Thiel");
  assert.equal(effective.provenance, "map");
});

test("isGenericNeighbourhood rejects island-level mentions only", () => {
  assert.equal(isGenericNeighbourhood("Curacao"), true);
  assert.equal(isGenericNeighbourhood("island"), true);
  assert.equal(isGenericNeighbourhood(null), true);
  assert.equal(isGenericNeighbourhood(""), true);
  assert.equal(isGenericNeighbourhood("Jan Thiel"), false);
});

test("XCG benchmark is primary with original shown as secondary", () => {
  const model = buildPriceDisplay({
    originalPrice: 100_000,
    originalCurrency: "USD",
    benchmarkPriceXcg: 179_000,
  });
  assert.equal(model.primaryCurrency, "XCG");
  assert.equal(model.primaryAmount, 179_000);
  assert.match(model.secondaryLabel ?? "", /100.?000/);
  assert.equal(model.showIndicativeTip, true);
  assert.equal(model.disclaimer, null);
  assert.equal(
    INDICATIVE_PRICE_TIP,
    "Indicative equivalent based on known information.",
  );
  assert.equal(model.sortKeyXcg, 179_000);
});

test("ANG/NAf original does not duplicate as a secondary amount", () => {
  const model = buildPriceDisplay({
    originalPrice: 50_000,
    originalCurrency: "ANG",
    benchmarkPriceXcg: 50_000,
  });
  assert.equal(model.secondaryLabel, null);
  assert.equal(model.showIndicativeTip, false);
  assert.equal(model.disclaimer, null);
});

test("XCG identity conversion does not show indicative tip", () => {
  const model = buildPriceDisplay({
    originalPrice: 100_000,
    originalCurrency: "XCG",
    benchmarkPriceXcg: 100_000,
  });
  assert.equal(model.showIndicativeTip, false);
  assert.equal(model.disclaimer, null);
  assert.equal(model.secondaryLabel, null);
});

test("missing benchmark shows the original with an unavailable notice", () => {
  const model = buildPriceDisplay({
    originalPrice: 250_000,
    originalCurrency: "EUR",
    benchmarkPriceXcg: null,
  });
  assert.equal(model.primaryCurrency, null);
  assert.equal(model.primaryAmount, 250_000);
  assert.equal(model.benchmarkUnavailable, true);
  assert.equal(model.showIndicativeTip, false);
  assert.equal(model.disclaimer, "XCG equivalent currently unavailable");
  assert.equal(model.sortKeyXcg, null);
});

test("sold listings surface the sold disclaimer", () => {
  const model = buildPriceDisplay({
    originalPrice: 100_000,
    originalCurrency: "XCG",
    benchmarkPriceXcg: 100_000,
    listingStatus: "sold",
  });
  assert.equal(
    model.soldDisclaimer,
    "Last known listing price. The actual sale price may differ.",
  );
  assert.equal(model.showIndicativeTip, false);
});

test("humanizeReasonCode maps common ReasonCode strings", () => {
  assert.equal(
    humanizeReasonCode("already_represented_by_source"),
    "Already represented by the source value",
  );
  assert.equal(
    humanizeReasonCode("confidence_too_low"),
    "Confidence too low to use",
  );
  assert.equal(humanizeReasonCode("some_new_code"), "some new code");
});

test("formatXcgPrimary prefixes the amount with the Cg symbol", () => {
  assert.equal(formatXcgPrimary(179_000), "Cg 179,000");
  assert.equal(formatXcgPrimary(1_927), "Cg 1,927");
});

test("neighbourhood AI attention is demoted when source or map already exists", () => {
  const decision = {
    key: "neighbourhood_candidate",
    status: "needs_attention",
    reasons: [],
  };
  assert.equal(
    isOperationalAttentionDecision(decision, {
      sourceNeighbourhood: "Toni Kunchi Curacao",
    }),
    false,
  );
  assert.equal(
    isOperationalAttentionDecision(decision, {
      mapNeighbourhood: "Blauw",
    }),
    false,
  );
  assert.equal(
    isOperationalAttentionDecision(
      { key: "gated_community", status: "needs_attention", reasons: [] },
      { sourceNeighbourhood: "Toni Kunchi Curacao" },
    ),
    true,
  );
});

test("represented candidates stay non-operational regardless of decision status", () => {
  for (const status of ["rejected", "redundant"]) {
    assert.equal(
      isOperationalAttentionDecision({
        key: "neighbourhood_candidate",
        status,
        reasons: ["already_represented_by_map"],
      }),
      false,
    );
  }
  assert.equal(decisionStatusLabel("redundant"), "Redundant");
});

test("neighbourhood aliases strip Curacao suffix and Blue Bay resort variants", () => {
  assert.equal(
    canonicalizeNeighbourhood("Jan Thiel Curacao").canonicalDisplay,
    "Jan Thiel",
  );
  assert.equal(
    canonicalizeNeighbourhood("Blue Bay Golf & Beach Resort").canonicalDisplay,
    "Blue Bay",
  );
  assert.equal(
    canonicalizeNeighbourhood("St. Joris").canonicalDisplay,
    "Sint Joris",
  );
  assert.equal(
    canonicalizeNeighbourhood("Brakkeput Abou").canonicalDisplay,
    "Brakkeput Abou",
  );
  assert.equal(canonicalizeNeighbourhood("Curacao").reason, "generic");
  assert.equal(canonicalizeNeighbourhood("Curacao").canonicalDisplay, null);
  assert.equal(normalizeNeighbourhoodKey("Jan Thiel Curaçao"), "jan thiel");
  assert.equal(
    neighbourhoodKeysMatch("Toni Kunchi Curacao", "Toni Kunchi"),
    true,
  );
});

test("effective neighbourhood display uses canonical name and keeps evidence", () => {
  const effective = resolveEffectiveNeighbourhood({
    sourceName: "Bottelier Curacao",
    mapName: "Bottelier",
  });
  assert.equal(effective.name, "Bottelier");
  assert.equal(effective.sourceName, "Bottelier Curacao");
  assert.equal(effective.mapName, "Bottelier");
  assert.equal(effective.conflict, false);
});

test("source vs map conflict remains after canonicalization", () => {
  const effective = resolveEffectiveNeighbourhood({
    sourceName: "Jan Thiel Curacao",
    mapName: "Mambo Beach",
  });
  assert.equal(effective.name, "Jan Thiel");
  assert.equal(effective.conflict, true);
});
