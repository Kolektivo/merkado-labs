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
import { getAccountId } from "@/lib/rent-advance/accounts";
import type { SupabaseClient } from "@supabase/supabase-js";

const STATE_ID = "live";

/** A fresh book seeded with the canonical demo offers (MRA-001 + MRA-010). */
function cloneBook(accountId: string | null): DemoBook {
  return normalizeBook(getSeedBook(), { bookAccountId: accountId ?? undefined });
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "PGRST204") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes("PGRST204");
}

async function readOrCreateAccountRow(
  supabase: SupabaseClient,
  accountId: string | null,
): Promise<DemoBook> {
  let query = supabase
    .from("ra_demo_state")
    .select("payload")
    .eq("id", STATE_ID);
  query = accountId ? query.eq("account_id", accountId) : query.is("account_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.payload) {
    const seed = cloneBook(accountId);
    const row = {
      id: STATE_ID,
      account_id: accountId,
      payload: seed,
      updated_at: new Date().toISOString(),
    };
    const { error: writeError } = accountId
      ? await supabase.from("ra_demo_state").upsert(row, {
          onConflict: "id,account_id",
        })
      : await supabase.from("ra_demo_state").insert(row);
    if (writeError) throw writeError;
    return seed;
  }
  const incoming = normalizeBook(data.payload, {
    bookAccountId: accountId ?? undefined,
  });
  const book = dropRetiredDemoOffers(incoming);
  const known = new Set(book.offers.map((offer) => offer.reference));
  const missing = getSeedBook().offers.filter(
    (offer) => !known.has(offer.reference),
  );
  if (missing.length || book !== incoming) {
    book.offers.push(...missing);
    return saveAccountRow(supabase, accountId, book);
  }
  if (storedMoneyOrNetworkStale(data.payload, book)) {
    return saveAccountRow(supabase, accountId, book);
  }
  return book;
}

async function saveAccountRow(
  supabase: SupabaseClient,
  accountId: string | null,
  book: DemoBook,
): Promise<DemoBook> {
  for (const offer of book.offers) {
    assertReleasesDistinct(offer.releases);
  }
  const normalized = normalizeBook(book, {
    bookAccountId: accountId ?? undefined,
  });
  if (accountId) {
    const { error } = await supabase.from("ra_demo_state").upsert(
      {
        id: STATE_ID,
        account_id: accountId,
        payload: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id,account_id" },
    );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("ra_demo_state")
      .update({
        payload: normalized,
        updated_at: new Date().toISOString(),
      })
      .eq("id", STATE_ID)
      .is("account_id", null);
    if (error) throw error;
  }
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
  const accountId = await getAccountId();
  return readOrCreateAccountRow(supabase, accountId);
}

export async function saveBook(book: DemoBook): Promise<DemoBook> {
  await assertDemoUnlocked();
  const supabase = createLabsAdminClient();
  const accountId = await getAccountId();
  return saveAccountRow(supabase, accountId, book);
}

export async function resetBook(): Promise<DemoBook> {
  await assertDemoUnlocked();
  const supabase = createLabsAdminClient();
  const accountId = await getAccountId();
  // Start a new chain-store epoch so old on-chain facts are never reused.
  // Reset does NOT roll back the chain; the env contract address keeps
  // working so approved offers mint again on the same deployment.
  try {
    await newEpoch(`reset ${new Date().toISOString()}`);
  } catch (error) {
    // Only the "table missing" case (chain-store migration not applied) is an
    // expected book-only reset. Any other error must surface.
    if (!isMissingRelationError(error)) throw error;
  }
  const seed = cloneBook(accountId);
  const { data, error: readError } = await supabase
    .from("ra_demo_state")
    .select("payload")
    .eq("id", STATE_ID)
    .eq("account_id", accountId)
    .maybeSingle();
  if (readError) throw readError;
  if (data?.payload) {
    const current = mergeCryptoConfig((data.payload as DemoBook).cryptoConfig);
    seed.cryptoConfig = cryptoConfigFor(resolvePayNetworkKey(current), current);
  }
  return saveAccountRow(supabase, accountId, seed);
}

/** Reset every Labs account while keeping the current global reset semantics. */
export async function resetAllBooks(): Promise<void> {
  await assertDemoUnlocked();
  const supabase = createLabsAdminClient();
  try {
    await newEpoch(`reset ${new Date().toISOString()}`);
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
  }

  const { data, error } = await supabase
    .from("ra_demo_state")
    .select("account_id,payload")
    .order("account_id", { ascending: true, nullsFirst: true });
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) {
    const accountId = await getAccountId();
    await saveAccountRow(supabase, accountId, cloneBook(accountId));
    return;
  }

  for (const row of rows) {
    const accountId = (row.account_id as string | null) ?? null;
    const seed = cloneBook(accountId);
    if (row.payload) {
      const current = mergeCryptoConfig((row.payload as DemoBook).cryptoConfig);
      seed.cryptoConfig = cryptoConfigFor(resolvePayNetworkKey(current), current);
    }
    await saveAccountRow(supabase, accountId, seed);
  }
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

/**
 * Background-job variants of load/save/update that skip the interactive demo
 * password gate. Only safe to call from a server-authorized job (e.g. the
 * CRON_SECRET-protected mint sweep). Never expose these to client code.
 *
 * They are account-agnostic by default (operate on the legacy shared book)
 * until Phase 3 rewires the sweep to iterate accounts via listAccountRows().
 * An optional accountId scopes the operation to that account.
 */
export async function loadBookForJob(
  accountId?: string | null,
): Promise<DemoBook> {
  const supabase = createLabsAdminClient();
  return readOrCreateAccountRow(supabase, accountId ?? null);
}

export async function saveBookForJob(
  book: DemoBook,
  accountId?: string | null,
): Promise<DemoBook> {
  const supabase = createLabsAdminClient();
  return saveAccountRow(supabase, accountId ?? null, book);
}

export async function updateOfferForJob(
  reference: string,
  updater: (offer: Offer, book: DemoBook) => Offer,
  accountId?: string | null,
): Promise<DemoBook> {
  const book = await loadBookForJob(accountId);
  const index = book.offers.findIndex((offer) => offer.reference === reference);
  if (index === -1) throw new Error(`Offer ${reference} was not found.`);
  book.offers[index] = updater(book.offers[index], book);
  return saveBookForJob(book, accountId);
}

/**
 * Account ids of every owned live book, for job iteration. Payloads are
 * never exposed; only the account identifiers are returned.
 */
export async function listAccountRows(): Promise<string[]> {
  const supabase = createLabsAdminClient();
  const { data, error } = await supabase
    .from("ra_demo_state")
    .select("account_id")
    .not("account_id", "is", null);
  if (error) throw error;
  return (data ?? [])
    .map((row) => row.account_id as string | null)
    .filter((value): value is string => Boolean(value));
}
