import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_MAINNET_NETWORK_KEY,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_NETWORK_KEY,
  BASE_SEPOLIA_NETWORK_LABEL,
  BASE_SEPOLIA_USDC_CONTRACT,
  DEFAULT_PAY_NETWORK_KEY,
  OP_MAINNET_CHAIN_ID,
  OP_MAINNET_NETWORK_KEY,
  OP_SEPOLIA_CHAIN_ID,
  OP_SEPOLIA_EXPLORER_BASE_URL,
  OP_SEPOLIA_NETWORK_KEY,
  canPersistPayNetwork,
  isOfficialExplorerBaseUrl,
  isSelectablePayNetwork,
  parseExactPayNetworkKey,
  parsePayNetworkKey,
  resolvePayNetworkKey,
  visiblePayNetworks,
} from "@/lib/pay/networks";
import { formatUsd, usdcAtomicFromUsdCents } from "@/lib/rent-advance/money";
import { createMockPaymentProvider } from "@/lib/pay/mock-provider";
import { attentionItems, bookTotals } from "@/lib/rent-advance/helpers";
import {
  CANONICAL_PAYMENT_REQUEST_ID,
  collectionIdFor,
  isExplorableTxHash,
  paymentTxIdFor,
  settlementTxIdFor,
} from "@/lib/rent-advance/ids";
import {
  applyPaymentOutcome,
  cryptoConfigFor,
  currentRenterPaymentRequest,
  earlierOpenPaymentRequest,
  emptyCryptoConfig,
  mergeCryptoConfig,
  normalizeBook,
} from "@/lib/rent-advance/payment-apply";
import {
  CANONICAL_REFERENCE,
  CHEAP_OFFER_REFERENCE,
  dropRetiredDemoOffers,
  getSeedBook,
} from "@/lib/rent-advance/seed";

test("MRA-001 USD 1800 becomes 1800000000 atomic USDC", () => {
  const atomic = usdcAtomicFromUsdCents(180000);
  assert.equal(atomic, 1_800_000_000);
  assert.equal((atomic / 1_000_000).toFixed(2), "1800.00");
  assert.equal(formatUsd(180000), "$1,800.00");
});

test("demo crypto config defaults to Base Sepolia native USDC", () => {
  const config = emptyCryptoConfig();
  assert.equal(config.networkKey, DEFAULT_PAY_NETWORK_KEY);
  assert.equal(config.networkLabel, BASE_SEPOLIA_NETWORK_LABEL);
  assert.equal(config.chainId, BASE_SEPOLIA_CHAIN_ID);
  assert.equal(config.usdcContract, BASE_SEPOLIA_USDC_CONTRACT);
  assert.equal(mergeCryptoConfig({ networkLabel: null }).networkLabel, BASE_SEPOLIA_NETWORK_LABEL);

  const request = getSeedBook().paymentRequests?.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.ok(request);
  assert.equal(request.amountUsdcAtomic, 1_800_000_000);
});

test("Admin only offers Base networks until Luis opts into Optimism", () => {
  const visible = visiblePayNetworks(false);
  assert.deepEqual(
    visible.map((network) => network.key),
    [BASE_SEPOLIA_NETWORK_KEY],
  );
  assert.equal(isSelectablePayNetwork(BASE_SEPOLIA_NETWORK_KEY), true);
  assert.equal(isSelectablePayNetwork(OP_SEPOLIA_NETWORK_KEY), false);
  assert.equal(isSelectablePayNetwork(BASE_MAINNET_NETWORK_KEY), false);
});

test("legacy OP books rematch to Base Sepolia", () => {
  assert.equal(resolvePayNetworkKey({ networkKey: "optimism" }), DEFAULT_PAY_NETWORK_KEY);
  assert.equal(
    mergeCryptoConfig({ networkKey: "optimism", chainId: OP_MAINNET_CHAIN_ID }).networkKey,
    BASE_SEPOLIA_NETWORK_KEY,
  );
  assert.equal(
    mergeCryptoConfig({ networkKey: OP_SEPOLIA_NETWORK_KEY, chainId: OP_SEPOLIA_CHAIN_ID })
      .networkKey,
    BASE_SEPOLIA_NETWORK_KEY,
  );
});

test("selected testnet and later mainnet facts stay catalog-owned", () => {
  const baseSepolia = cryptoConfigFor(BASE_SEPOLIA_NETWORK_KEY);
  assert.equal(baseSepolia.chainId, BASE_SEPOLIA_CHAIN_ID);
  assert.equal(baseSepolia.usdcContract, BASE_SEPOLIA_USDC_CONTRACT);

  const opMainnet = cryptoConfigFor(OP_MAINNET_NETWORK_KEY);
  assert.equal(opMainnet.networkKey, OP_MAINNET_NETWORK_KEY);
  assert.equal(opMainnet.chainId, OP_MAINNET_CHAIN_ID);
});

test("short names do not persist as mainnet", () => {
  assert.equal(parsePayNetworkKey("base"), null);
  assert.equal(parsePayNetworkKey("op"), null);
  assert.equal(parseExactPayNetworkKey("op-mainnet"), OP_MAINNET_NETWORK_KEY);
  assert.equal(parseExactPayNetworkKey("optimism"), null);
});

test("stored mainnet rematches to the default testnet unless mainnet is enabled", () => {
  assert.equal(canPersistPayNetwork(OP_MAINNET_NETWORK_KEY), false);
  assert.equal(
    mergeCryptoConfig({ networkKey: OP_MAINNET_NETWORK_KEY }).networkKey,
    BASE_SEPOLIA_NETWORK_KEY,
  );
});

test("official explorers are allowlisted for every catalog network", () => {
  assert.equal(isOfficialExplorerBaseUrl(OP_SEPOLIA_EXPLORER_BASE_URL), true);
  assert.equal(isOfficialExplorerBaseUrl("https://optimistic.etherscan.io"), true);
  assert.equal(isOfficialExplorerBaseUrl("https://sepolia.basescan.org"), true);
  assert.equal(isOfficialExplorerBaseUrl("https://basescan.org"), true);
  assert.equal(isOfficialExplorerBaseUrl("https://evil.example"), false);
});

test("normalizeBook refreshes a stale USDC amount to the 1:1 USD figure", () => {
  const book = getSeedBook();
  const stale = book.paymentRequests?.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.ok(stale);
  stale.amountUsdcAtomic = 1_005_586_592;
  const next = normalizeBook(book);
  const request = next.paymentRequests?.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.equal(request?.amountUsdcAtomic, 1_800_000_000);
});

test("demo hashes are not explorer links", () => {
  assert.equal(isExplorableTxHash("0xDEMO0000SAFE00MERKADOPAY000000000000000"), false);
  assert.equal(
    isExplorableTxHash("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    true,
  );
});

test("the demo book seeds only the two walkthrough offers", () => {
  const book = getSeedBook();
  assert.deepEqual(
    book.offers.map((offer) => offer.reference),
    [CANONICAL_REFERENCE, CHEAP_OFFER_REFERENCE],
  );
});

test("retired filler offers are dropped without removing new drafts", () => {
  const book = getSeedBook();
  const cheap = book.offers.find((offer) => offer.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(cheap);
  const filler = structuredClone(cheap);
  filler.reference = "MRA-002";
  filler.offerId = "offer-mra-002";
  const draft = structuredClone(cheap);
  draft.reference = "MRA-007";
  draft.offerId = "offer-mra-007";
  draft.status = "draft";
  const next = dropRetiredDemoOffers({
    ...book,
    offers: [...book.offers, filler, draft],
    assignedTenancies: [...book.assignedTenancies, "tn-002"],
  });
  assert.deepEqual(
    next.offers.map((offer) => offer.reference),
    [CANONICAL_REFERENCE, CHEAP_OFFER_REFERENCE, "MRA-007"],
  );
  assert.equal(next.assignedTenancies.includes("tn-002"), false);
});

test("draft and unfunded offers are excluded from advanced totals", () => {
  const book = getSeedBook();
  const mra001 = book.offers.find((offer) => offer.reference === CANONICAL_REFERENCE);
  const cheap = book.offers.find((offer) => offer.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(mra001 && cheap);

  const funding = structuredClone(cheap);
  funding.reference = "MRA-FUNDING";
  funding.status = "funding";
  funding.fundedCents = 200;
  funding.purchasePriceCents = 500;

  const review = structuredClone(cheap);
  review.reference = "MRA-REVIEW";
  review.status = "under_review";
  review.fundedCents = 0;

  const draft = structuredClone(cheap);
  draft.reference = "MRA-DRAFT";
  draft.status = "draft";
  draft.fundedCents = 0;

  const totals = bookTotals({
    ...book,
    offers: [mra001, funding, review, draft],
  });

  assert.equal(totals.totalAdvanced, mra001.purchasePriceCents + funding.purchasePriceCents);
  assert.ok(totals.totalAdvanced < totals.totalAdvanced + draft.purchasePriceCents);
  assert.ok(totals.totalAdvanced < totals.totalAdvanced + review.purchasePriceCents);
});

test("confirming the same payment cannot duplicate collection or distribution", () => {
  const book = getSeedBook();
  const first = applyPaymentOutcome(
    book,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:00:00.000Z",
  );
  const second = applyPaymentOutcome(
    first,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:01:00.000Z",
  );
  const third = applyPaymentOutcome(
    second,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:02:00.000Z",
  );

  const collectionId = collectionIdFor("MRA-001", 1);
  for (const next of [first, second, third]) {
    const offer = next.offers.find((row) => row.reference === "MRA-001");
    const request = next.paymentRequests?.find(
      (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
    );
    const receivable = offer?.receivables.find((row) => row.n === 1);
    assert.ok(offer && request && receivable);
    assert.equal(request.status, "confirmed");
    assert.equal(receivable.status, "received");
    assert.equal(
      offer.collections.filter((row) => row.receivableN === 1).length,
      1,
    );
    assert.equal(
      (next.distributions ?? []).filter((row) => row.collectionId === collectionId)
        .length,
      1,
    );
  }
});

test("later month cannot confirm while an earlier month is still open", () => {
  const book = getSeedBook();
  const later = (book.paymentRequests ?? [])
    .filter((row) => row.offerReference === "MRA-001")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[1];

  assert.ok(later);
  const earlier = earlierOpenPaymentRequest(book, later.paymentRequestId);
  assert.equal(earlier?.paymentRequestId, CANONICAL_PAYMENT_REQUEST_ID);
  assert.throws(
    () => applyPaymentOutcome(book, later.paymentRequestId, "confirmed"),
    /first/,
  );
});

test("draft MRA-001 does not mint payment requests", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === "MRA-001");
  assert.ok(offer);
  offer.status = "draft";

  const next = normalizeBook(book);
  assert.deepEqual(
    (next.paymentRequests ?? []).filter((row) => row.offerReference === "MRA-001"),
    [],
  );
});

test("provider transaction hash is stored on confirm", () => {
  const book = getSeedBook();
  const hash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const next = applyPaymentOutcome(
    book,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:00:00.000Z",
    { txHash: hash, transactionId: "tx-live-001" },
  );
  const request = next.paymentRequests?.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.equal(request?.txHash, hash);
  assert.equal(request?.transactionId, paymentTxIdFor(CANONICAL_PAYMENT_REQUEST_ID));
});

test("client transaction ids cannot overwrite the settlement ledger", () => {
  const book = getSeedBook();
  const settlementId = settlementTxIdFor("MRA-001");
  const next = applyPaymentOutcome(
    book,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:00:00.000Z",
    { transactionId: settlementId, txHash: "not-a-hash", fromLabel: "<script>" },
  );
  const settlement = next.ledgerTransactions?.find((row) => row.transactionId === settlementId);
  const request = next.paymentRequests?.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.equal(settlement?.kind, "advance_settlement");
  assert.equal(request?.transactionId, paymentTxIdFor(CANONICAL_PAYMENT_REQUEST_ID));
  assert.notEqual(request?.txHash, "not-a-hash");
  assert.equal(
    next.ledgerTransactions?.find((row) => row.transactionId === request?.transactionId)
      ?.fromLabel,
    "Renter demo wallet",
  );
});

test("copy-address path can submit without a connected wallet", async () => {
  const provider = createMockPaymentProvider();
  const submitted = await provider.reportExternalTransfer({
    paymentRequestId: CANONICAL_PAYMENT_REQUEST_ID,
    expectedAtomicAmount: 1_800_000_000,
    recipient: "0xDEMO0000SAFE00MERKADOPAY000000000000000",
    offerReference: "MRA-001",
    receivableId: "rec-mra-001-1",
    method: "external",
  });
  assert.equal(submitted.status, "submitted");
  assert.ok(submitted.txHash);
});

test("wallet path fails until the demo wallet is connected", async () => {
  const provider = createMockPaymentProvider();
  const submitted = await provider.submitPayment({
    paymentRequestId: CANONICAL_PAYMENT_REQUEST_ID,
    expectedAtomicAmount: 1_800_000_000,
    recipient: "0xDEMO0000SAFE00MERKADOPAY000000000000000",
    offerReference: "MRA-001",
    receivableId: "rec-mra-001-1",
    method: "wallet",
  });
  assert.equal(submitted.status, "failed");
  assert.equal(submitted.errorCode, "wallet_disconnected");
});

test("seeded collections are already in automatic holder distribution", () => {
  const book = normalizeBook(getSeedBook());
  const pending = attentionItems(book).find(
    (item) => item.label === "Holder distribution pending",
  );
  assert.equal(pending?.count, 0);
});

test("confirming pay still updates the shared book on a Base testnet config", () => {
  const book = normalizeBook({
    ...getSeedBook(),
    cryptoConfig: cryptoConfigFor(BASE_SEPOLIA_NETWORK_KEY),
  });
  const next = applyPaymentOutcome(
    book,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:00:00.000Z",
  );
  const offer = next.offers.find((row) => row.reference === "MRA-001");
  const request = next.paymentRequests?.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.equal(next.cryptoConfig?.networkKey, BASE_SEPOLIA_NETWORK_KEY);
  assert.equal(request?.status, "confirmed");
  assert.equal(offer?.receivables.find((row) => row.n === 1)?.status, "received");
  assert.equal(offer?.collections.filter((row) => row.receivableN === 1).length, 1);
  assert.equal(
    (next.distributions ?? []).filter((row) => row.collectionId === collectionIdFor("MRA-001", 1))
      .length,
    1,
  );
  assert.equal(currentRenterPaymentRequest(next)?.periodLabel, "October 2026");
});

test("next renter payment is the earliest unpaid request", () => {
  const book = getSeedBook();
  assert.equal(
    currentRenterPaymentRequest(book)?.paymentRequestId,
    CANONICAL_PAYMENT_REQUEST_ID,
  );

  const afterSeptember = applyPaymentOutcome(
    book,
    CANONICAL_PAYMENT_REQUEST_ID,
    "confirmed",
    "2026-09-28T12:00:00.000Z",
  );
  assert.equal(
    currentRenterPaymentRequest(afterSeptember)?.periodLabel,
    "October 2026",
  );
});
