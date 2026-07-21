import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidListingImageUrl,
  resolveListingGalleryUrls,
  resolveListingPrimaryImageUrl,
  uniqueListingImages,
} from "../../src/lib/listing-gallery-urls.ts";

test("isValidListingImageUrl accepts only absolute http(s)", () => {
  assert.equal(
    isValidListingImageUrl("https://cdn.remax-abc.com/photo.jpg"),
    true,
  );
  assert.equal(isValidListingImageUrl("http://example.com/a.png"), true);
  assert.equal(isValidListingImageUrl("/relative/path.jpg"), false);
  assert.equal(isValidListingImageUrl("not a url"), false);
  assert.equal(isValidListingImageUrl(""), false);
});

test("uniqueListingImages drops invalid and duplicate URLs", () => {
  assert.deepEqual(
    uniqueListingImages([
      "https://cdn.example.com/a.jpg",
      "/bad.jpg",
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
    ]),
    ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
  );
});

test("resolveListingGalleryUrls validates gallery and primary fallback", () => {
  assert.deepEqual(
    resolveListingGalleryUrls({
      imageUrls: ["https://cdn.example.com/a.jpg", "bad"],
      primaryImageUrl: "https://cdn.example.com/primary.jpg",
    }),
    ["https://cdn.example.com/a.jpg"],
  );
  assert.deepEqual(
    resolveListingGalleryUrls({
      imageUrls: ["bad", ""],
      primaryImageUrl: "https://cdn.example.com/primary.jpg",
    }),
    ["https://cdn.example.com/primary.jpg"],
  );
  assert.deepEqual(
    resolveListingGalleryUrls({
      imageUrls: null,
      primaryImageUrl: "/relative.jpg",
    }),
    [],
  );
});

test("resolveListingPrimaryImageUrl returns first valid gallery URL", () => {
  assert.equal(
    resolveListingPrimaryImageUrl({
      imageUrls: ["https://cdn.example.com/a.jpg"],
      primaryImageUrl: "https://cdn.example.com/primary.jpg",
    }),
    "https://cdn.example.com/a.jpg",
  );
  assert.equal(
    resolveListingPrimaryImageUrl({
      imageUrls: ["bad"],
      primaryImageUrl: null,
    }),
    null,
  );
});
