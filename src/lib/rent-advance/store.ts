import "server-only";

import { assertReleasesDistinct } from "@/lib/rent-advance/dual-control";
import {
  anonymizeOffer,
  isMarketplaceStatus,
  toPortfolioPosition,
  toPortfolioPositionDetail,
  toPurchaserOffer,
} from "@/lib/rent-advance/helpers";
import { normalizeBook } from "@/lib/rent-advance/payment-apply";
import { getSeedBook } from "@/lib/rent-advance/seed";
import type {
  BuyerOfferCard,
  DemoBook,
  Offer,
  PortfolioPosition,
  PortfolioPositionDetail,
  PurchaserOfferDetail,
} from "@/lib/rent-advance/types";
import { createLabsAdminClient } from "@/lib/supabase/admin";

const STATE_ID = "live";

function cloneBook(): DemoBook {
  return structuredClone(getSeedBook());
}

export async function loadBook(): Promise<DemoBook> {
  const supabase = createLabsAdminClient();
  const { data, error } = await supabase
    .from("ra_demo_state")
    .select("payload")
    .eq("id", STATE_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data?.payload) {
    const seed = cloneBook();
    const { error: writeError } = await supabase.from("ra_demo_state").upsert({
      id: STATE_ID,
      payload: seed,
      updated_at: new Date().toISOString(),
    });
    if (writeError) throw writeError;
    return seed;
  }
  return normalizeBook(data.payload);
}

export async function saveBook(book: DemoBook): Promise<DemoBook> {
  for (const offer of book.offers) {
    assertReleasesDistinct(offer.releases);
  }
  const normalized = normalizeBook(book);
  const supabase = createLabsAdminClient();
  const { error } = await supabase.from("ra_demo_state").upsert({
    id: STATE_ID,
    payload: normalized,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return normalized;
}

export async function resetBook(): Promise<DemoBook> {
  return saveBook(cloneBook());
}

export async function getOffer(reference: string): Promise<Offer | null> {
  const book = await loadBook();
  return book.offers.find((offer) => offer.reference === reference) ?? null;
}

export async function listMarketplaceCards(): Promise<BuyerOfferCard[]> {
  const book = await loadBook();
  return book.offers.filter((offer) => isMarketplaceStatus(offer.status)).map(anonymizeOffer);
}

export async function getPurchaserOffer(
  reference: string,
): Promise<PurchaserOfferDetail | null> {
  const offer = await getOffer(reference);
  if (!offer || !isMarketplaceStatus(offer.status)) return null;
  return toPurchaserOffer(offer);
}

export async function listPortfolioPositions(): Promise<{
  positions: PortfolioPosition[];
  contributed: number;
  received: number;
  expectedRemaining: number;
  active: number;
}> {
  const book = await loadBook();
  const funded = book.offers.filter((offer) => offer.fundedCents > 0);
  const positions = funded.map((offer) => toPortfolioPosition(offer, book));
  return {
    positions,
    contributed: positions.reduce((sum, row) => sum + row.fundedCents, 0),
    received: positions.reduce((sum, row) => sum + row.receivedCents, 0),
    expectedRemaining: positions.reduce((sum, row) => sum + row.remainingCents, 0),
    active: positions.filter((row) =>
      ["live", "collecting", "funding"].includes(row.status),
    ).length,
  };
}

export async function getPortfolioPosition(
  reference: string,
): Promise<PortfolioPositionDetail | null> {
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  if (!offer || offer.fundedCents <= 0) return null;
  return toPortfolioPositionDetail(offer, book);
}

export async function updateOffer(
  reference: string,
  updater: (offer: Offer, book: DemoBook) => Offer,
): Promise<DemoBook> {
  const book = await loadBook();
  const index = book.offers.findIndex((offer) => offer.reference === reference);
  if (index === -1) throw new Error(`Offer ${reference} was not found.`);
  book.offers[index] = updater(book.offers[index], book);
  return saveBook(book);
}
