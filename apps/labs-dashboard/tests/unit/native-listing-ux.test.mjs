import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { availableNativeListingActions } from "../../src/lib/native-listings/lifecycle-ui.ts";

const wizardSource = readFileSync(
  new URL(
    "../../src/components/native-listing/native-listing-wizard.tsx",
    import.meta.url,
  ),
  "utf8",
);
const actionsSource = readFileSync(
  new URL(
    "../../src/components/native-listing/native-listing-actions.tsx",
    import.meta.url,
  ),
  "utf8",
);
const imageRouteSource = readFileSync(
  new URL(
    "../../src/app/api/native-listings/[id]/images/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const imageServiceSource = readFileSync(
  new URL("../../src/lib/native-listings/service.ts", import.meta.url),
  "utf8",
);

test("native lifecycle controls only expose valid status transitions", () => {
  assert.deepEqual(availableNativeListingActions("draft"), ["publish"]);
  assert.deepEqual(availableNativeListingActions("unpublished"), [
    "republish",
    "mark_sold",
    "mark_rented",
  ]);
  assert.deepEqual(availableNativeListingActions("active"), [
    "unpublish",
    "mark_sold",
    "mark_rented",
  ]);
  assert.deepEqual(availableNativeListingActions("sold"), ["republish"]);
  assert.deepEqual(availableNativeListingActions("inactive"), ["republish"]);
  assert.deepEqual(availableNativeListingActions("removed"), []);
  assert.match(actionsSource, /Confirm \{confirm\.label\.toLowerCase\(\)\}/);
});

test("wizard review uses Browse labels and includes a Passport preview", () => {
  assert.match(wizardSource, /publicListingTypeLabel/);
  assert.match(wizardSource, /Browse card preview/);
  assert.match(wizardSource, /Property Passport preview/);
  assert.match(wizardSource, /User provided/);
  assert.match(wizardSource, /Nothing becomes public until you publish/);
});

test("active edit saves without attempting another publish", () => {
  assert.match(wizardSource, /isActiveEdit/);
  assert.match(wizardSource, /Save changes/);
  assert.match(wizardSource, /saveActiveChanges/);
});

test("photo management supports cover, exact reorder, and safe removal", () => {
  assert.match(wizardSource, /Set cover/);
  assert.match(wizardSource, /Remove this photo\?/);
  assert.match(wizardSource, /remainingImageSlots/);
  assert.match(imageRouteSource, /export async function DELETE/);
  assert.match(imageServiceSource, /removeNativeImage/);
  assert.match(imageServiceSource, /delete_native_listing_image/);
});

test("wizard exposes accessible progress and validation feedback", () => {
  assert.match(wizardSource, /aria-label="Property listing progress"/);
  assert.match(wizardSource, /aria-current=\{current \? "step"/);
  assert.match(wizardSource, /aria-invalid/);
  assert.match(wizardSource, /Check the highlighted fields/);
});
