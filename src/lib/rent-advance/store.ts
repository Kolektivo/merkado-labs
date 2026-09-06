import "server-only";

import { assertReleasesDistinct } from "@/lib/rent-advance/dual-control";
import { mergeOnchain } from "@/lib/rent-advance/custody";
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
import {
  readCurrentOfferClaimable,
  readCurrentOfferOwner,
} from "@/lib/onchain/verify";
import { usdCentsFromUsdcAtomic } from "@/lib/rent-advance/money";
import type { SupabaseClient } from "@supabase/supabase-js";

const STATE_ID = "live";

/** A fresh book seeded with the canonical demo offers (MRA-001 + MRA-010). */
function cloneBook(
  seedOwnerAccountId?: string | null,
  seedRenterWalletAddress?: string | null,
): DemoBook {
  const seed = structuredClone(getSeedBook());
  seed.seedOwnerAccountId = seedOwnerAccountId ?? null;
  if (seedOwnerAccountId || seedRenterWalletAddress) {
    seed.offers = seed.offers.map((offer) => ({
      ...offer,
      createdByAccountId: seedOwnerAccountId ?? null,
      renterWalletAddress: seedRenterWalletAddress ?? offer.renterWalletAddress,
    }));
  }
  return normalizeBook(seed);
}

function nextRevision(previous?: string | null): string {
  const previousMs = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(Date.now(), previousMs + 1)).toISOString();
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "42P01" || code === "PGRST204" || code === "PGRST205") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /relation .* does not exist|table .* not found/i.test(message);
}

async function readOrCreateSharedRow(supabase: SupabaseClient): Promise<DemoBook> {
  const { data, error } = await supabase
    .from("ra_demo_state")
    .select("payload,updated_at")
    .eq("id", STATE_ID)
    .is("account_id", null)
    .maybeSingle();
  if (error) throw error;
  if (!data?.payload) {
    const updatedAt = nextRevision();
    const seed = { ...cloneBook(), sharedStateUpdatedAt: updatedAt };
    const { error: writeError } = await supabase.from("ra_demo_state").insert({
      id: STATE_ID,
      account_id: null,
      payload: seed,
      updated_at: updatedAt,
    });
    if (writeError) {
      const retry = await supabase
        .from("ra_demo_state")
        .select("payload,updated_at")
        .eq("id", STATE_ID)
        .is("account_id", null)
        .maybeSingle();
      if (retry.error) throw retry.error;
      if (retry.data?.payload) {
        return {
          ...normalizeBook(retry.data.payload),
          sharedStateUpdatedAt: retry.data.updated_at ?? null,
        };
      }
      throw writeError;
    }
    return seed;
  }
  const incoming = {
    ...normalizeBook(data.payload),
    sharedStateUpdatedAt: data.updated_at ?? null,
  };
  const book = dropRetiredDemoOffers(incoming);
  const known = new Set(book.offers.map((offer) => offer.reference));
  const missing = getSeedBook().offers.filter(
    (offer) => !known.has(offer.reference),
  );
  if (missing.length || book.offers.length !== incoming.offers.length) {
    book.offers.push(...missing);
    return saveSharedRow(supabase, book);
  }
  if (storedMoneyOrNetworkStale(data.payload, book)) {
    return saveSharedRow(supabase, book);
  }
  return book;
}

async function saveSharedRow(supabase: SupabaseClient, book: DemoBook): Promise<DemoBook> {
  for (const offer of book.offers) {
    assertReleasesDistinct(offer.releases);
  }
  const expectedRevision = book.sharedStateUpdatedAt;
  if (!expectedRevision) {
    throw new Error("Shared demo state revision is missing; reload and retry.");
  }
  const updatedAt = nextRevision(expectedRevision);
  const normalized = normalizeBook({ ...book, sharedStateUpdatedAt: updatedAt });
  const { data, error } = await supabase
    .from("ra_demo_state")
    .update({
      payload: normalized,
      updated_at: updatedAt,
    })
    .eq("id", STATE_ID)
    .is("account_id", null)
    .eq("updated_at", expectedRevision)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Shared demo state changed; reload and retry.");
  return normalized;
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

export async function loadBook(): Promise<DemoBook> {
  await assertDemoUnlocked();
  const supabase = createLabsAdminClient();
  return readOrCreateSharedRow(supabase);
}

export async function saveBook(book: DemoBook): Promise<DemoBook> {
  await assertDemoUnlocked();
  const supabase = createLabsAdminClient();
  return saveSharedRow(supabase, book);
}

export async function resetBook(
  seedOwnerAccountId: string,
  seedRenterWalletAddress?: string | null,
): Promise<DemoBook> {
  await assertDemoUnlocked();
  const supabase = createLabsAdminClient();
  // Start a new chain-store epoch so old on-chain facts are never reused.
  // Reset does NOT roll back the chain; the env contract address keeps
  // working so approved offers mint again on the same deployment.
  try {
    await newEpoch(`reset ${new Date().toISOString()}`);
  } catch (error) {
    // The chain-store migration is optional for the local book walkthrough.
    if (!isMissingRelationError(error)) throw error;
  }
  const seed = cloneBook(seedOwnerAccountId, seedRenterWalletAddress);
  const { data, error: readError } = await supabase
    .from("ra_demo_state")
    .select("payload,updated_at")
    .eq("id", STATE_ID)
    .is("account_id", null)
    .maybeSingle();
  if (readError) throw readError;
  if (data?.payload) {
    const current = mergeCryptoConfig((data.payload as DemoBook).cryptoConfig);
    seed.cryptoConfig = cryptoConfigFor(resolvePayNetworkKey(current), current);
    seed.sharedStateUpdatedAt = data.updated_at ?? null;
  } else {
    const updatedAt = nextRevision();
    const initial = { ...seed, sharedStateUpdatedAt: updatedAt };
    const { error: insertError } = await supabase.from("ra_demo_state").insert({
      id: STATE_ID,
      account_id: null,
      payload: initial,
      updated_at: updatedAt,
    });
    if (insertError) throw insertError;
    return initial;
  }
  return saveSharedRow(supabase, seed);
}

export async function getOffer(reference: string): Promise<Offer | null> {
  const book = await loadBook();
  return book.offers.find((offer) => offer.reference === reference) ?? null;
}

export async function getOfferForAccount(
  reference: string,
  accountId: string,
): Promise<Offer | null> {
  const offer = await getOffer(reference);
  return offer && offer.createdByAccountId === accountId ? offer : null;
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

function sameWallet(left: string | null | undefined, right: string): boolean {
  return Boolean(left && left.toLowerCase() === right.toLowerCase());
}

export function paymentRequestsForWallet(
  book: DemoBook,
  walletAddress: string,
): NonNullable<DemoBook["paymentRequests"]> {
  return (book.paymentRequests ?? []).filter((request) =>
    sameWallet(request.renterWalletAddress, walletAddress),
  );
}

export function offersForAccount(book: DemoBook, accountId: string): Offer[] {
  return book.offers.filter((offer) => offer.createdByAccountId === accountId);
}

export async function listPortfolioPositions(walletAddress?: string | null): Promise<{
  positions: PortfolioPosition[];
  contributed: number;
  received: number;
  expectedRemaining: number;
  active: number;
}> {
  const book = await loadBook();
  const funded: Offer[] = [];
  for (const offer of book.offers) {
    if (offer.fundedCents <= 0 || !walletAddress) continue;
    const onchain = mergeOnchain(offer.onchain);
    const configuredContract = process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS?.trim();
    const liveOwner =
      configuredContract && onchain.tokenId != null && onchain.contractAddress
        ? await readCurrentOfferOwner(onchain.contractAddress, onchain.tokenId)
        : null;
    const owns = configuredContract && onchain.tokenId != null && onchain.contractAddress
      ? sameWallet(liveOwner, walletAddress)
      : sameWallet(onchain.purchaserAddress, walletAddress);
    if (owns) funded.push(offer);
  }
  const positions = await Promise.all(
    funded.map(async (offer) => {
      const position = toPortfolioPosition(offer, book);
      const onchain = mergeOnchain(offer.onchain);
      const configuredContract = process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS?.trim();
      if (!configuredContract || onchain.tokenId == null || !onchain.contractAddress) {
        return position;
      }
      const liveClaimable = await readCurrentOfferClaimable(
        onchain.contractAddress,
        onchain.tokenId,
      );
      return liveClaimable == null
        ? position
        : {
            ...position,
            pendingDistributionCents: usdCentsFromUsdcAtomic(liveClaimable),
          };
    }),
  );
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
  walletAddress?: string | null,
): Promise<PortfolioPositionDetail | null> {
  const book = await loadBook();
  const offer = book.offers.find((row) => row.reference === reference);
  const onchain = mergeOnchain(offer?.onchain);
  const configuredContract = process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS?.trim();
  const liveOwner =
    configuredContract && onchain.tokenId != null && onchain.contractAddress && walletAddress
      ? await readCurrentOfferOwner(onchain.contractAddress, onchain.tokenId)
      : null;
  const owns = offer && walletAddress
    ? configuredContract && onchain.tokenId != null && onchain.contractAddress
      ? sameWallet(liveOwner, walletAddress)
      : sameWallet(onchain.purchaserAddress, walletAddress)
    : false;
  if (!offer || offer.fundedCents <= 0 || !owns) return null;
  const position = toPortfolioPositionDetail(offer, book);
  if (!configuredContract || onchain.tokenId == null || !onchain.contractAddress) {
    return position;
  }
  const liveClaimable = await readCurrentOfferClaimable(
    onchain.contractAddress,
    onchain.tokenId,
  );
  return liveClaimable == null
    ? position
    : {
        ...position,
        pendingDistributionCents: usdCentsFromUsdcAtomic(liveClaimable),
      };
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
 * Server-only variants of load/save/update that skip the interactive demo
 * password gate. Only safe to call from an explicitly authorized server
 * action. Never expose these to client code.
 *
 * They always operate on the shared demo book.
 */
export async function loadBookForJob(): Promise<DemoBook> {
  const supabase = createLabsAdminClient();
  return readOrCreateSharedRow(supabase);
}

export async function saveBookForJob(book: DemoBook): Promise<DemoBook> {
  const supabase = createLabsAdminClient();
  return saveSharedRow(supabase, book);
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
