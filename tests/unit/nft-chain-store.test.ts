import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { Module } from "node:module";

// Stub the "server-only" marker so the server-only chain store can be loaded
// by the plain Node test runner, and stub the Labs admin module so no network
// client is ever created (mock Supabase client, no network).
type ModuleInternals = {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};
const internals = Module as unknown as ModuleInternals;
const originalLoad = internals._load;

type MockRow = Record<string, unknown>;
type PartialUnique = { cols: string[]; where: (row: MockRow) => boolean };
type MockTable = {
  rows: MockRow[];
  uniques: string[][];
  partials: PartialUnique[];
};

type MockStore = {
  ra_chain_epochs: MockTable;
  ra_chain_offers: MockTable;
  ra_chain_events: MockTable;
  ra_rent_payment_attempts: MockTable;
  ra_rent_deposit_verifications: MockTable;
  ra_rent_claim_verifications: MockTable;
};

let mockClient: MockSupabase;

internals._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/src/lib/supabase/admin")) {
    return { createLabsAdminClient: () => mockClient };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const CONTRACT = "0x1111111111111111111111111111111111111111";
const PAYOUT = "0x3333333333333333333333333333333333333333";
const PAYER = "0x4444444444444444444444444444444444444444";
const BUYER = "0x5555555555555555555555555555555555555555";
const EPOCH_ID = "epoch-walkthrough-1";
const OFFER_KEY = "0x" + "a".repeat(64);
const OPAQUE_1 = "0x" + "1".repeat(64);
const OPAQUE_2 = "0x" + "2".repeat(64);
const TX_1 = "0x" + "c".repeat(64);
const TX_2 = "0x" + "d".repeat(64);
const BLOCK_HASH = "0x" + "b".repeat(64);

function emptyTable(): MockTable {
  return { rows: [], uniques: [], partials: [] };
}

function makeStore(): MockStore {
  return {
    ra_chain_epochs: emptyTable(),
    ra_chain_offers: {
      rows: [],
      uniques: [
        ["chain_id", "contract_address", "token_id"],
        ["chain_id", "offer_key"],
      ],
      partials: [],
    },
    ra_chain_events: {
      rows: [],
      uniques: [["chain_id", "tx_hash", "log_index"]],
      partials: [],
    },
    ra_rent_payment_attempts: {
      rows: [],
      uniques: [["opaque_payment_id"]],
      partials: [],
    },
    ra_rent_deposit_verifications: {
      rows: [],
      uniques: [
        ["chain_id", "tx_hash", "log_index"],
        ["opaque_payment_id"],
      ],
      partials: [
        { cols: ["payment_request_id"], where: (row) => row.status === "confirmed" },
      ],
    },
    ra_rent_claim_verifications: {
      rows: [],
      uniques: [
        ["chain_id", "tx_hash", "log_index"],
        ["chain_id", "contract_address", "token_id", "tx_hash"],
      ],
      partials: [],
    },
  };
}

function enrichDefaults(table: string): MockRow {
  const now = "2026-08-21T12:00:00.000Z";
  switch (table) {
    case "ra_chain_epochs":
      return { id: "epoch-test-1", active: true, created_at: now };
    case "ra_chain_offers":
      return { created_at: now, purchased: false };
    case "ra_chain_events":
      return { id: "evt-test-1", created_at: now };
    case "ra_rent_payment_attempts":
      return { attempt_id: "attempt-test-1", created_at: now };
    case "ra_rent_deposit_verifications":
      return { id: "dep-test-1", status: "confirmed", confirmed_at: now };
    case "ra_rent_claim_verifications":
      return { id: "claim-test-1", confirmed_at: now };
    default:
      return {};
  }
}

class MockMutation {
  constructor(
    private q: MockQueryBuilder,
    private kind: "insert" | "upsert",
    private row: MockRow,
    private opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {}

  select() {
    return new MockMutationResult(this.execute());
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: MockRow[] | null; error: { code: string; message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): {
    data: MockRow[] | null;
    error: { code: string; message: string } | null;
  } {
    const table = this.q.store[this.q.table];
    const conflictCols = this.opts?.onConflict?.split(",").map((c) => c.trim()) ?? [];
    if (this.kind === "upsert" && conflictCols.length > 0) {
      const existingIdx = table.rows.findIndex((r) =>
        conflictCols.every((c) => r[c] === this.row[c]),
      );
      if (existingIdx >= 0) {
        if (this.opts?.ignoreDuplicates) return { data: [], error: null };
        table.rows[existingIdx] = { ...table.rows[existingIdx], ...this.row };
        return { data: [table.rows[existingIdx]], error: null };
      }
    }
    const conflict = this.findConflict(table);
    if (conflict) {
      return { data: null, error: { code: "23505", message: conflict } };
    }
    const enriched = { ...this.row, ...enrichDefaults(this.q.table) };
    table.rows.push(enriched);
    return { data: [enriched], error: null };
  }

  private findConflict(table: MockTable): string | null {
    for (const cols of table.uniques) {
      if (
        cols.every((c) => this.row[c] !== undefined && this.row[c] !== null) &&
        table.rows.some((r) => cols.every((c) => r[c] === this.row[c]))
      ) {
        return `duplicate key value violates unique constraint (${cols.join(", ")})`;
      }
    }
    for (const partial of table.partials) {
      if (
        partial.where(this.row) &&
        table.rows.some(
          (r) => partial.where(r) && partial.cols.every((c) => r[c] === this.row[c]),
        )
      ) {
        return `duplicate key value violates unique constraint (${partial.cols.join(", ")})`;
      }
    }
    return null;
  }
}

class MockMutationResult {
  constructor(private result: { data: MockRow[] | null; error: { code: string; message: string } | null }) {}

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: MockRow[] | null; error: { code: string; message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }

  single(): Promise<{ data: MockRow | null; error: { code: string; message: string } | null }> {
    const { data, error } = this.result;
    if (error) return Promise.resolve({ data: null, error });
    if (data && data.length === 1) return Promise.resolve({ data: data[0], error: null });
    return Promise.resolve({
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    });
  }

  maybeSingle(): Promise<{ data: MockRow | null; error: { code: string; message: string } | null }> {
    const { data, error } = this.result;
    if (error) return Promise.resolve({ data: null, error });
    if (data && data.length > 1) {
      return Promise.resolve({
        data: null,
        error: { code: "PGRST116", message: "Multiple (or no) rows returned" },
      });
    }
    return Promise.resolve({ data: data?.[0] ?? null, error: null });
  }
}

class MockQueryBuilder {
  private filters: Record<string, unknown> = {};
  private projection: string[] | null = null;
  private orderBy: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;

  constructor(
    readonly store: Record<string, MockTable>,
    readonly table: string,
  ) {}

  select(cols?: string) {
    this.projection = cols ? cols.split(",").map((c) => c.trim()) : null;
    return this;
  }

  eq(col: string, value: unknown) {
    this.filters[col] = value;
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  insert(row: MockRow) {
    return new MockMutation(this, "insert", row);
  }

  upsert(row: MockRow, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    return new MockMutation(this, "upsert", row, opts);
  }

  async maybeSingle() {
    const rows = this.matched();
    if (rows.length > 1) {
      return { data: null, error: { code: "PGRST116", message: "Multiple (or no) rows returned" } };
    }
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    const rows = this.matched();
    if (rows.length !== 1) {
      return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
    }
    return { data: rows[0], error: null };
  }

  private matched(): MockRow[] {
    let rows = this.store[this.table].rows.filter((row) =>
      Object.entries(this.filters).every(([k, v]) => row[k] === v),
    );
    if (this.orderBy) {
      rows = [...rows].sort((a, b) => {
        const av = String(a[this.orderBy!.col]);
        const bv = String(b[this.orderBy!.col]);
        return this.orderBy!.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    const projection = this.projection;
    if (projection) rows = rows.map((r) => pick(r, projection));
    return rows;
  }
}

class MockSupabase {
  constructor(readonly store: Record<string, MockTable>) {}

  from(table: string) {
    if (!this.store[table]) this.store[table] = emptyTable();
    return new MockQueryBuilder(this.store, table);
  }
}

function pick(row: MockRow, cols: string[]): MockRow {
  const out: MockRow = {};
  for (const col of cols) out[col] = row[col];
  return out;
}

type ChainStoreModule = typeof import("@/lib/onchain/chain-store");

let chain: ChainStoreModule;

beforeEach(async () => {
  mockClient = new MockSupabase(makeStore());
  chain = await import("@/lib/onchain/chain-store");
});

const OFFER_INPUT = {
  offerKey: OFFER_KEY,
  chainId: 84532,
  contractAddress: CONTRACT,
  tokenId: BigInt(1),
  payoutAddress: PAYOUT,
  purchasePrice: BigInt(1020600),
  rentInstallmentAmount: BigInt(300000),
  epochId: EPOCH_ID,
};

test("ensureActiveEpoch returns the existing active epoch", async () => {
  mockClient.store.ra_chain_epochs.rows.push({
    id: "epoch-existing",
    label: "walkthrough",
    active: true,
    created_at: "2026-08-21T10:00:00.000Z",
  });
  const epoch = await chain.ensureActiveEpoch();
  assert.equal(epoch.id, "epoch-existing");
  assert.equal(epoch.label, "walkthrough");
  assert.equal(mockClient.store.ra_chain_epochs.rows.length, 1);
});

test("ensureActiveEpoch creates a default epoch when none is active", async () => {
  const epoch = await chain.ensureActiveEpoch();
  assert.equal(epoch.label, "default");
  assert.equal(epoch.active, true);
  assert.ok(epoch.id);
});

test("newEpoch records a labelled epoch", async () => {
  const epoch = await chain.newEpoch("2026-08-21 snapshot");
  assert.equal(epoch.label, "2026-08-21 snapshot");
  assert.equal(mockClient.store.ra_chain_epochs.rows.length, 1);
});

test("recordOffer stores decimal-string amounts and token ids", async () => {
  const row = await chain.recordOffer(OFFER_INPUT);
  assert.equal(row.token_id, "1");
  assert.equal(row.purchase_price, "1020600");
  assert.equal(row.rent_installment_amount, "300000");
  const stored = mockClient.store.ra_chain_offers.rows[0];
  assert.equal(stored.purchase_price, "1020600");
  assert.equal(stored.rent_installment_amount, "300000");
});

test("recordOffer is idempotent on the chain/contract/token unique", async () => {
  await chain.recordOffer(OFFER_INPUT);
  const second = await chain.recordOffer({
    ...OFFER_INPUT,
    purchasePrice: BigInt(9999999),
  });
  assert.equal(mockClient.store.ra_chain_offers.rows.length, 1);
  assert.equal(second.purchase_price, "1020600");
  assert.equal(second.offer_key, OFFER_KEY);
});

test("markOfferPurchased is idempotent and keeps the first purchase", async () => {
  await chain.recordOffer(OFFER_INPUT);
  const first = await chain.markOfferPurchased({
    chainId: 84532,
    contractAddress: CONTRACT,
    tokenId: BigInt(1),
    purchaseTxHash: TX_1,
    purchaseBlockNumber: 200,
    purchaserAddress: BUYER,
  });
  assert.equal(first.purchased, true);
  assert.equal(first.purchase_tx_hash, TX_1);

  const second = await chain.markOfferPurchased({
    chainId: 84532,
    contractAddress: CONTRACT,
    tokenId: BigInt(1),
    purchaseTxHash: TX_2,
    purchaseBlockNumber: 201,
    purchaserAddress: BUYER,
  });
  assert.equal(second.purchase_tx_hash, TX_1);
  assert.equal(mockClient.store.ra_chain_offers.rows[0].purchase_tx_hash, TX_1);
});

test("recordChainEvent ignores duplicate logs on (chain, tx, logIndex)", async () => {
  const input = {
    epochId: EPOCH_ID,
    chainId: 84532,
    contractAddress: CONTRACT,
    txHash: TX_1,
    logIndex: 0,
    blockNumber: 100,
    blockHash: BLOCK_HASH,
    eventName: "OfferMinted",
    eventArgs: { tokenId: "1" },
  };
  const first = await chain.recordChainEvent(input);
  assert.equal(first.recorded, true);
  const second = await chain.recordChainEvent(input);
  assert.equal(second.recorded, false);
  assert.equal(second.row.tx_hash, TX_1);
  assert.equal(mockClient.store.ra_chain_events.rows.length, 1);
});

test("createPaymentAttempt tolerates an existing opaque payment id", async () => {
  const input = {
    epochId: EPOCH_ID,
    chainId: 84532,
    contractAddress: CONTRACT,
    tokenId: BigInt(1),
    paymentRequestId: "payreq-mra-001-202609",
    opaquePaymentId: OPAQUE_1,
    expectedAmount: BigInt(1800000000),
    status: "pending" as const,
  };
  const first = await chain.createPaymentAttempt(input);
  assert.equal(first.recorded, true);
  assert.equal(first.row.expected_amount, "1800000000");

  const second = await chain.createPaymentAttempt({ ...input, status: "confirmed" });
  assert.equal(second.recorded, false);
  assert.equal(second.row.status, "pending");
  assert.equal(mockClient.store.ra_rent_payment_attempts.rows.length, 1);
});

test("recordDepositVerification records decimal-string amounts", async () => {
  const input = {
    chainId: 84532,
    txHash: TX_1,
    logIndex: 2,
    blockNumber: 150,
    tokenId: BigInt(1),
    opaquePaymentId: OPAQUE_1,
    amount: BigInt(1800000000),
    payerAddress: PAYER,
    paymentRequestId: "payreq-mra-001-202609",
    epochId: EPOCH_ID,
  };
  const result = await chain.recordDepositVerification(input);
  assert.equal(result.recorded, true);
  assert.equal(result.row.amount, "1800000000");
  assert.equal(result.row.token_id, "1");
  assert.equal(mockClient.store.ra_rent_deposit_verifications.rows[0].amount, "1800000000");
});

test("recordDepositVerification returns the authoritative confirmed row on a payment-request conflict", async () => {
  const first = await chain.recordDepositVerification({
    chainId: 84532,
    txHash: TX_1,
    logIndex: 2,
    blockNumber: 150,
    tokenId: BigInt(1),
    opaquePaymentId: OPAQUE_1,
    amount: BigInt(1800000000),
    payerAddress: PAYER,
    paymentRequestId: "payreq-mra-001-202609",
    epochId: EPOCH_ID,
  });
  assert.equal(first.recorded, true);

  const second = await chain.recordDepositVerification({
    chainId: 84532,
    txHash: TX_2,
    logIndex: 0,
    blockNumber: 160,
    tokenId: BigInt(1),
    opaquePaymentId: OPAQUE_2,
    amount: BigInt(1800000000),
    payerAddress: PAYER,
    paymentRequestId: "payreq-mra-001-202609",
    epochId: EPOCH_ID,
  });
  assert.equal(second.recorded, false);
  assert.equal(second.row.opaque_payment_id, OPAQUE_1);
  assert.equal(second.row.payment_request_id, "payreq-mra-001-202609");
  assert.equal(second.row.status, "confirmed");
  assert.equal(mockClient.store.ra_rent_deposit_verifications.rows.length, 1);
});

test("recordDepositVerification is idempotent on the log unique", async () => {
  const input = {
    chainId: 84532,
    txHash: TX_1,
    logIndex: 2,
    blockNumber: 150,
    tokenId: BigInt(1),
    opaquePaymentId: OPAQUE_1,
    amount: BigInt(1800000000),
    payerAddress: PAYER,
    paymentRequestId: "payreq-mra-001-202609",
    epochId: EPOCH_ID,
  };
  const first = await chain.recordDepositVerification(input);
  assert.equal(first.recorded, true);
  const second = await chain.recordDepositVerification(input);
  assert.equal(second.recorded, false);
  assert.equal(second.row.tx_hash, TX_1);
  assert.equal(mockClient.store.ra_rent_deposit_verifications.rows.length, 1);
});

test("recordClaimVerification returns the existing row on a duplicate", async () => {
  const input = {
    chainId: 84532,
    txHash: TX_1,
    logIndex: 1,
    blockNumber: 180,
    contractAddress: CONTRACT,
    tokenId: BigInt(1),
    ownerAddress: BUYER,
    amount: BigInt(1800000000),
    epochId: EPOCH_ID,
  };
  const first = await chain.recordClaimVerification(input);
  assert.equal(first.recorded, true);
  assert.equal(first.row.amount, "1800000000");
  const second = await chain.recordClaimVerification(input);
  assert.equal(second.recorded, false);
  assert.equal(second.row.tx_hash, TX_1);
  assert.equal(mockClient.store.ra_rent_claim_verifications.rows.length, 1);
});