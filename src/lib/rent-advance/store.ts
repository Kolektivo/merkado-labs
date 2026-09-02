import "server-only";

import { assertReleasesDistinct } from "@/lib/rent-advance/dual-control";
import {
  anonymizeOffer,
  isMarketplaceStatus,
  marketplaceOfferFilter,
  toPortfolioPosition,
  toPortfolioPositionDetail,
  toPurchaserOffer,
} from "@/lib/rent-advance/helpers";
import {
  cryptoConfigFor,
  mergeCryptoConfig,
  normalizeBook,
} from "@/lib/rent-advance/payment-apply";
import { resolvePayNetworkKey } from "@/lib/pay/networks";
import { dropRetiredDemoOffers, getSeedBook } from "@/lib/rent-advance/seed";
import type {
  BuyerOfferCard,
  DemoBook,
  Offer,
  PortfolioPosition,
  PortfolioPositionDetail,
  PurchaserOfferDetail,
} from "@/lib/rent-advance/types";
import { assertDemoUnlocked } from "@/lib/demo-gate-server";
import { createLabsAdminClient } from "@/lib/supabase/admin";
import { newEpoch } from "@/lib/onchain/chain-store";
import { readCurrentOfferOwner } from "@/lib/onchain/verify";
import { walletAddressMatches } from "@/lib/wallet/identity";

const STATE_ID = "live";

/** A fresh book seeded with the canonical demo offers (MRA-001 + MRA-010). */
function cloneBook(seedOwnerWalletAddress?: string): DemoBook {
  const seed = structuredClone(getSeedBook());
  seed.seedOwnerWalletAddress = seedOwnerWalletAddress ?? null;
  if (seedOwnerWalletAddress) {
    seed.offers = seed.offers.map((offer) => ({
      ...offer,
      createdByWalletAddress: seedOwnerWalletAddress,
    }));
  }
  return seed;
}

export async function loadBook(): Promise<DemoBook> {
  await assertDemoUnlocked();
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
  const incoming = normalizeBook(data.payload);
  const book = dropRetiredDemoOffers(incoming);
  const seed = cloneBook();
  const known = new Set(book.offers.map((offer) => offer.reference));
  const missing = seed.offers.filter((offer) => !known.has(offer.reference));
  if (missing.length || book !== incoming) {
    book.offers.push(...missing);
    return saveBook(book);
  }
  if (storedMoneyOrNetworkStale(data.payload, book)) {
    return saveBook(book);
  }
  return book;
}

function storedMoneyOrNetworkStale(raw: unknown, book: DemoBook): boolean {
  const incoming = (raw ?? {}) as DemoBook;
  const storedConfig = incoming.cryptoConfig;
  const nextConfig = book.cryptoConfig;
  if (
    !storedConfig?.networkKey ||
    storedConfig.networkKey !== nextConfig?.networkKey ||
    storedConfig.chainId !== nextConfig?.chainId ||
    storedConfig.usdcContract !== nextConfig?.usdcContract ||
    storedConfig.explorerBaseUrl !== nextConfig?.explorerBaseUrl ||
    storedConfig.networkLabel !== nextConfig?.networkLabel
  ) {
    return true;
  }
  const stored = incoming.paymentRequests ?? [];
  return (book.paymentRequests ?? []).some((row) => {
    const previous = stored.find((item) => item.paymentRequestId === row.paymentRequestId);
    return (
      !previous ||
      previous.amountUsdcAtomic !== row.amountUsdcAtomic ||
      previous.receivingAddress !== row.receivingAddress
    );
  });
}

export async function saveBook(book: DemoBook): Promise<DemoBook> {
  await assertDemoUnlocked();
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

export async function resetBook(seedOwnerWalletAddress: string): Promise<DemoBook> {
  await assertDemoUnlocked();
  // Start a new chain-store epoch so old on-chain facts are never reused.
  // Reset does NOT roll back the chain; the env contract address keeps
  // working so approved offers mint again on the same deployment.
  try {
    await newEpoch(`reset ${new Date().toISOString()}`);
  } catch {
    // The chain-store tables are not applied yet; keep a book-only reset.
  }
  const seed = cloneBook(seedOwnerWalletAddress);
  try {
    const supabase = createLabsAdminClient();
    const { data } = await supabase
      .from("ra_demo_state")
      .select("payload")
      .eq("id", STATE_ID)
      .maybeSingle();
    if (data?.payload) {
      const current = mergeCryptoConfig((data.payload as DemoBook).cryptoConfig);
      seed.cryptoConfig = cryptoConfigFor(resolvePayNetworkKey(current), current);
    }
  } catch {
    // Keep the seed network if the current book cannot be read.
  }
  return saveBook(seed);
}

export function walletOwnsOffer(offer: Offer, walletAddress: string): boolean {
  return Boolean(
    offer.createdByWalletAddress &&
      walletAddressMatches(offer.createdByWalletAddress, walletAddress),
  );
}

export function walletOwnsPaymentRequest(
  request: NonNullable<DemoBook["paymentRequests"]>[number],
  walletAddress: string,
): boolean {
  return Boolean(
    request.renterWalletAddress &&
      walletAddressMatches(request.renterWalletAddress, walletAddress),
  );
}

export function walletOwnsPosition(
  position: NonNullable<DemoBook["positions"]>[number],
  walletAddress: string,
): boolean {
  return Boolean(
    position.holderWalletAddress &&
      walletAddressMatches(position.holderWalletAddress, walletAddress),
  );
}

export function offersForWallet(book: DemoBook, walletAddress: string): Offer[] {
  return book.offers.filter((offer) => walletOwnsOffer(offer, walletAddress));
}

export function paymentRequestsForWallet(
  book: DemoBook,
  walletAddress: string,
) {
  return (book.paymentRequests ?? []).filter((request) =>
    walletOwnsPaymentRequest(request, walletAddress),
  );
}

export async function getOffer(reference: string): Promise<Offer | null> {
  const book = await loadBook();
  return book.offers.find((offer) => offer.reference === reference) ?? null;
}

export async function listMarketplaceCards(): Promise<BuyerOfferCard[]> {
  const book = await loadBook();
  return book.offers.filter(marketplaceOfferFilter).map(anonymizeOffer);
}

export async function getPurchaserOffer(
  reference: string,
): Promise<PurchaserOfferDetail | null> {
  const offer = await getOffer(reference);
  if (!offer || !isMarketplaceStatus(offer.status)) return null;
  return toPurchaserOffer(offer);
}

export async function listPortfolioPositions(walletAddress?: string): Promise<{
  positions: PortfolioPosition[];
  contributed: number;
  received: number;
  expectedRemaining: number;
  active: number;
}> {
  const book = await loadBook();
  const funded = [] as Offer[];
  for (const offer of book.offers) {
    if (!offer.fundedCents || !walletAddress) continue;
    const onchain = offer.onchain;
    const configuredContract = process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS?.trim();
    const liveOwner =
      configuredContract && onchain?.tokenId != null && onchain.contractAddress
        ? await readCurrentOfferOwner(onchain.contractAddress, onchain.tokenId)
        : null;
    const owns = configuredContract && onchain?.tokenId != null && onchain.contractAddress
      ? Boolean(liveOwner && walletAddressMatches(liveOwner, walletAddress))
      : walletAddressMatches(onchain?.purchaserAddress ?? "", walletAddress);
    if (owns) funded.push(offer);
  }
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
  walletAddress?: string,
): Promise<PortfolioPositionDetail | null> {
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  const onchain = offer?.onchain;
  const configuredContract = process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS?.trim();
  const liveOwner =
    configuredContract && onchain?.tokenId != null && onchain.contractAddress
      ? await readCurrentOfferOwner(onchain.contractAddress, onchain.tokenId)
      : null;
  if (
    !offer ||
    offer.fundedCents <= 0 ||
    !walletAddress ||
    !(
      configuredContract && onchain?.tokenId != null && onchain.contractAddress
        ? Boolean(liveOwner && walletAddressMatches(liveOwner, walletAddress))
        : walletAddressMatches(onchain?.purchaserAddress ?? "", walletAddress)
    )
  ) {
    return null;
  }
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

/**
 * Background-job variants of load/save/update that skip the interactive demo
 * password gate. Only safe to call from a server-authorized job (e.g. the
 * CRON_SECRET-protected mint sweep). Never expose these to client code.
 */
export async function loadBookForJob(): Promise<DemoBook> {
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
  const incoming = normalizeBook(data.payload);
  const book = dropRetiredDemoOffers(incoming);
  const known = new Set(book.offers.map((offer) => offer.reference));
  const missing = cloneBook().offers.filter((offer) => !known.has(offer.reference));
  if (missing.length || book !== incoming) {
    book.offers.push(...missing);
    return saveBookForJob(book);
  }
  if (storedMoneyOrNetworkStale(data.payload, book)) {
    return saveBookForJob(book);
  }
  return book;
}

export async function saveBookForJob(book: DemoBook): Promise<DemoBook> {
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

export async function updateOfferForJob(
  reference: string,
  updater: (offer: Offer, book: DemoBook) => Offer,
): Promise<DemoBook> {
  const book = await loadBookForJob();
  const index = book.offers.findIndex((offer) => offer.reference === reference);
  if (index === -1) throw new Error(`Offer ${reference} was not found.`);
  book.offers[index] = updater(book.offers[index], book);
  return saveBookForJob(book);
}
