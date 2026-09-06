import assert from "node:assert/strict";
import test from "node:test";

import { mergeOnchain } from "@/lib/rent-advance/custody";
import {
  isMarketplaceStatus,
  marketplaceOfferFilter,
  toPurchaserOffer,
} from "@/lib/rent-advance/helpers";
import { CHEAP_OFFER_REFERENCE, getSeedBook } from "@/lib/rent-advance/seed";
import type { Offer } from "@/lib/rent-advance/types";

const TX_MINT = "0x" + "b".repeat(64);
const TX_PURCHASE = "0x" + "c".repeat(64);

/** Mirror of getPurchaserOffer's unchanged status gate (no mint check). */
function purchaserOfferMirror(offer: Offer | undefined) {
  if (!offer || !isMarketplaceStatus(offer.status)) return null;
  return toPurchaserOffer(offer);
}

function seedOffer(): Offer {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  return structuredClone(offer);
}

function mintOffer(offer: Offer): Offer {
  const next = structuredClone(offer);
  next.onchain = {
    ...mergeOnchain(offer.onchain),
    tokenId: 2,
    mintTxHash: TX_MINT,
  };
  return next;
}

test("a funding offer that is not yet minted is excluded from the Marketplace", () => {
  const offer = seedOffer();
  assert.equal(offer.status, "funding");
  assert.equal(mergeOnchain(offer.onchain).mintTxHash, null);
  assert.equal(marketplaceOfferFilter(offer), false);
});

test("a funding offer that is minted is included in the Marketplace", () => {
  const offer = mintOffer(seedOffer());
  assert.equal(offer.status, "funding");
  assert.equal(marketplaceOfferFilter(offer), true);
});

test("a sold offer is excluded from the Marketplace", () => {
  const offer = seedOffer();
  offer.status = "live";
  offer.onchain = {
    ...mergeOnchain(offer.onchain),
    tokenId: 2,
    mintTxHash: TX_MINT,
    purchased: true,
    purchaseTxHash: TX_PURCHASE,
  };
  assert.equal(marketplaceOfferFilter(offer), false);
});

test("getPurchaserOffer still resolves the mint-pending offer detail", () => {
  const offer = seedOffer();
  assert.equal(marketplaceOfferFilter(offer), false);
  const detail = purchaserOfferMirror(offer);
  assert.ok(detail);
  assert.equal(detail.reference, CHEAP_OFFER_REFERENCE);
  assert.equal(detail.status, "funding");
});
