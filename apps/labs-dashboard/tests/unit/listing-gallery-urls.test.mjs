import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeListingImageUrl,
  isValidListingImageUrl,
  listingImageIdentityKey,
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

test("uniqueListingImages drops invalid and exact duplicate URLs", () => {
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

test("uniqueListingImages collapses resize query variants", () => {
  assert.deepEqual(
    uniqueListingImages([
      "https://cdn.example.com/photo.jpg?w=400&h=300",
      "https://cdn.example.com/photo.jpg?w=800&h=600",
    ]),
    ["https://cdn.example.com/photo.jpg?w=800&h=600"],
  );
});

test("uniqueListingImages collapses RE/MAX empty-body near-aspect variants", () => {
  const out = uniqueListingImages([
    "https://cdn.remax-abc.com/img/cache/-1761237153-1000x559.jpg",
    "https://cdn.remax-abc.com/img/cache/-1761237153-1000x561.jpg",
    "https://cdn.remax-abc.com/img/cache/-1761237153-1000x480.jpg",
  ]);
  assert.equal(out.length, 2);
  assert.match(out[0], /1000x561/);
  assert.match(out[1], /1000x480/);
});

test("uniqueListingImages keeps WordPress original over size suffix", () => {
  assert.deepEqual(
    uniqueListingImages([
      "https://site.example/wp-content/uploads/2024/01/living-300x200.jpg",
      "https://site.example/wp-content/uploads/2024/01/living.jpg",
    ]),
    ["https://site.example/wp-content/uploads/2024/01/living.jpg"],
  );
});

test("listingImageIdentityKey aligns RE/MAX named cache variants", () => {
  const a = "https://cdn.remax-abc.com/img/cache/11-1775162488-1000x667.jpg";
  const b = "https://cdn.remax-abc.com/img/cache/11-1775162488-607x405.jpg";
  assert.equal(listingImageIdentityKey(a), listingImageIdentityKey(b));
});

test("canonicalizeListingImageUrl strips tracking and upgrades http", () => {
  const canon = canonicalizeListingImageUrl(
    "http://CDN.Example.com/path/img.jpg?utm_campaign=test&w=800",
  );
  assert.equal(canon.startsWith("https://cdn.example.com/"), true);
  assert.equal(canon.includes("utm_campaign"), false);
  assert.equal(canon.includes("w=800"), true);
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
