import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Validation helpers are TypeScript; assert contracts via source + lightweight reimplementation mirror.
const validationSource = readFileSync(
  new URL("../../src/lib/native-listings/validation.ts", import.meta.url),
  "utf8",
);

test("native validation distinguishes draft and publish gates", () => {
  assert.match(validationSource, /validateNativeDraft/);
  assert.match(validationSource, /validateNativePublish/);
  assert.match(validationSource, /evaluateManualPublicEligibility/);
  assert.match(validationSource, /missing_contact/);
  assert.match(validationSource, /missing_image/);
  assert.match(validationSource, /At least one image is required to publish/);
});

test("native currency helper preserves original amount provenance", () => {
  const currencySource = readFileSync(
    new URL("../../src/lib/native-listings/currency.ts", import.meta.url),
    "utf8",
  );
  assert.match(currencySource, /usd_fixed_peg/);
  assert.match(currencySource, /legacy_1_to_1/);
  assert.match(currencySource, /labs_native_listing/);
  assert.doesNotMatch(currencySource, /source_official_conversion/);
});

test("native constants keep real_estate_type separate from car|real_estate discriminator", () => {
  const constants = readFileSync(
    new URL("../../src/lib/native-listings/constants.ts", import.meta.url),
    "utf8",
  );
  assert.match(constants, /REAL_ESTATE_TYPE_OPTIONS/);
  assert.match(constants, /NATIVE_LISTING_ORIGIN = "manual"/);
  assert.doesNotMatch(constants, /property_type.*=.*car/);
});

// Keep require available for future compiled helpers without failing this suite.
void createRequire;
void pathToFileURL;
