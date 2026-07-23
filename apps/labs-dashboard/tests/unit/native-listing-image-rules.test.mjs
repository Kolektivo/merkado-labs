import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const MAX_NATIVE_IMAGES = 12;

function validateUploadCapacity(existingCount, incomingCount, maxImages = MAX_NATIVE_IMAGES) {
  if (incomingCount < 1) return { ok: false, error: "No files uploaded." };
  if (existingCount < 0) return { ok: false, error: "Invalid existing image count." };
  if (existingCount >= maxImages) {
    return {
      ok: false,
      error: `This listing already has the maximum of ${maxImages} images.`,
    };
  }
  const remaining = maxImages - existingCount;
  if (incomingCount > remaining) {
    return {
      ok: false,
      error: `This listing can accept ${remaining} more image${remaining === 1 ? "" : "s"} (maximum ${maxImages} total).`,
    };
  }
  return { ok: true };
}

function validateReorderPermutation(orderedPaths, storedPaths) {
  if (!Array.isArray(orderedPaths) || orderedPaths.length === 0) {
    return { ok: false, error: "orderedPaths is required." };
  }
  if (orderedPaths.some((path) => typeof path !== "string" || !path.trim())) {
    return { ok: false, error: "Image paths must be non-empty strings." };
  }
  if (orderedPaths.length !== storedPaths.length) {
    return {
      ok: false,
      error: "Reorder must include every stored image exactly once.",
    };
  }
  const uniqueOrdered = new Set(orderedPaths);
  if (uniqueOrdered.size !== orderedPaths.length) {
    return { ok: false, error: "Duplicate image paths are not allowed." };
  }
  const stored = new Set(storedPaths);
  for (const path of orderedPaths) {
    if (!stored.has(path)) {
      return {
        ok: false,
        error: "Unknown or foreign image path in reorder request.",
      };
    }
  }
  return { ok: true };
}

function assignPrimaryFlags(images) {
  if (!images.length) return [];
  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.map((image, index) => ({
    ...image,
    isPrimary: index === 0,
  }));
}

function assertExactlyOnePrimary(images) {
  if (!images.length) return { ok: true };
  const primaryCount = images.filter((image) => image.isPrimary).length;
  if (primaryCount !== 1) {
    return {
      ok: false,
      error: `Expected exactly one primary image, found ${primaryCount}.`,
    };
  }
  return { ok: true };
}

const imageRulesSource = readFileSync(
  new URL("../../src/lib/native-listings/image-rules.ts", import.meta.url),
  "utf8",
);
const serviceSource = readFileSync(
  new URL("../../src/lib/native-listings/service.ts", import.meta.url),
  "utf8",
);
const imagesRouteSource = readFileSync(
  new URL("../../src/app/api/native-listings/[id]/images/route.ts", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260723140000_native_listing_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);
const reorderMigrationSource = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260723152000_native_listing_image_reorder_atomic.sql",
    import.meta.url,
  ),
  "utf8",
);

test("MAX_NATIVE_IMAGES is a per-listing total capacity", () => {
  assert.equal(validateUploadCapacity(0, 12).ok, true);
  assert.equal(validateUploadCapacity(0, 13).ok, false);
  assert.equal(validateUploadCapacity(10, 2).ok, true);
  assert.equal(validateUploadCapacity(10, 3).ok, false);
  assert.equal(validateUploadCapacity(12, 1).ok, false);
  assert.match(validateUploadCapacity(11, 2).error, /1 more image/);
  assert.match(imageRulesSource, /per-listing total/);
  assert.match(serviceSource, /validateUploadCapacity/);
  assert.match(imagesRouteSource, /per-listing total/);
});

test("reorder accepts only an exact unique permutation of stored paths", () => {
  const stored = ["a.jpg", "b.jpg", "c.jpg"];
  assert.equal(validateReorderPermutation(["c.jpg", "a.jpg", "b.jpg"], stored).ok, true);
  assert.equal(validateReorderPermutation(["a.jpg", "b.jpg"], stored).ok, false);
  assert.equal(
    validateReorderPermutation(["a.jpg", "b.jpg", "c.jpg", "d.jpg"], stored).ok,
    false,
  );
  assert.equal(
    validateReorderPermutation(["a.jpg", "a.jpg", "b.jpg"], stored).ok,
    false,
  );
  assert.equal(
    validateReorderPermutation(["a.jpg", "b.jpg", "foreign.jpg"], stored).ok,
    false,
  );
  assert.match(serviceSource, /reorder_native_listing_images/);
  assert.match(
    reorderMigrationSource,
    /Image order must include every stored image exactly once/,
  );
  assert.match(reorderMigrationSource, /count\(distinct path\)/);
  assert.match(reorderMigrationSource, /for update/);
});

test("exactly one primary when images exist", () => {
  const none = assignPrimaryFlags([]);
  assert.deepEqual(none, []);
  assert.equal(assertExactlyOnePrimary(none).ok, true);

  const one = assignPrimaryFlags([{ sortOrder: 0, id: "1" }]);
  assert.equal(assertExactlyOnePrimary(one).ok, true);
  assert.equal(one[0].isPrimary, true);

  const many = assignPrimaryFlags([
    { sortOrder: 2, id: "c", isPrimary: true },
    { sortOrder: 0, id: "a", isPrimary: false },
    { sortOrder: 1, id: "b", isPrimary: true },
  ]);
  assert.equal(assertExactlyOnePrimary(many).ok, true);
  assert.equal(many.filter((row) => row.isPrimary).length, 1);
  assert.equal(many[0].id, "a");
  assert.equal(many[0].isPrimary, true);

  assert.match(serviceSource, /ensureExactlyOnePrimary/);
  assert.match(migrationSource, /listing_images_one_primary_per_listing_idx/);
});

test("lifecycle status + Passport event apply atomically via RPC", () => {
  assert.match(serviceSource, /apply_native_listing_lifecycle/);
  assert.match(serviceSource, /applyLifecycleAtomically/);
  assert.match(serviceSource, /Status \+ Passport event/);
  assert.doesNotMatch(
    serviceSource,
    /await appendEvent\(\s*client,\s*listingId,\s*action === "republish"/,
  );
  assert.match(migrationSource, /create or replace function public\.apply_native_listing_lifecycle/);
  assert.match(migrationSource, /for update/);
  assert.match(migrationSource, /insert into public\.listing_activity_events/);
  assert.match(migrationSource, /grant execute on function public\.apply_native_listing_lifecycle/);
  assert.match(migrationSource, /to service_role/);
});
