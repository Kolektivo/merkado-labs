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
  toPublicCryptoConfig,
  visiblePayNetworks,
} from "@/lib/pay/networks";
import { formatUsd, usdcAtomicFromUsdCents } from "@/lib/rent-advance/money";
import { independentApproverById } from "@/lib/rent-advance/actors";
import { attentionItems, bookTotals } from "@/lib/rent-advance/helpers";
import { payoutAddressLocked } from "@/lib/rent-advance/custody";
import {
  CANONICAL_PAYMENT_REQUEST_ID,
  collectionIdFor,
  isExplorableTxHash,
  paymentTxIdFor,
} from "@/lib/rent-advance/ids";
import {
  applyVerifiedPurchase,
  applyVerifiedRentDeposit,
  cryptoConfigFor,
  currentRenterPaymentRequest,
  earlierOpenPaymentRequest,
  emptyCryptoConfig,
  mergeCryptoConfig,
  normalizeBook,
  type VerifiedPurchaseFacts,
  type VerifiedRentDepositFacts,
} from "@/lib/rent-advance/payment-apply";
import {
  CANONICAL_REFERENCE,
  CHEAP_OFFER_REFERENCE,
  dropRetiredDemoOffers,
  getSeedBook,
} from "@/lib/rent-advance/seed";
import type { DemoBook } from "@/lib/rent-advance/types";

const BUYER = "0x5555555555555555555555555555555555555555";
const PAYER = "0x4444444444444444444444444444444444444444";
const TX_PURCHASE = "0x" + "c".repeat(64);
const TX_RENT = "0x" + "d".repeat(64);
const OPAQUE = "0x" + "e".repeat(64);
const CONTRACT = "0x1111111111111111111111111111111111111111";

function mintOffer(book: DemoBook, reference: string, tokenId: number): DemoBook {
  const offer = book.offers.find((row) => row.reference === reference);
  assert.ok(offer);
  offer.onchain = {
    tokenId,
    offerKey: "0x" + "a".repeat(64),
    contractAddress: CONTRACT,
    epochId: "epoch-test",
    mintTxHash: "0x" + "b".repeat(64),
    mintBlockNumber: "100",
    purchased: false,
    purchaseTxHash: null,
    purchaserAddress: null,
    payoutAddress: payoutAddressLocked(offer) ?? "",
    landlordPaid: false,
    claimableRentCents: 0,
    claimedRentCents: 0,
  };
  return book;
}

function buyOffer(
  book: DemoBook,
  reference: string,
  at: string,
  tokenId = 1,
): DemoBook {
  const minted = mintOffer(book, reference, tokenId);
  const offer = minted.offers.find((row) => row.reference === reference);
  assert.ok(offer);
  const facts: VerifiedPurchaseFacts = {
    tokenId,
    purchaserAddress: BUYER,
    txHash: TX_PURCHASE,
    payoutAddress: payoutAddressLocked(offer) ?? "",
    purchasePriceAtomic: BigInt(usdcAtomicFromUsdCents(offer.purchasePriceCents)),
  };
  return applyVerifiedPurchase(minted, reference, facts, at);
}

function payRent(
  book: DemoBook,
  paymentRequestId: string,
  at: string,
): DemoBook {
  const request = book.paymentRequests?.find(
    (row) => row.paymentRequestId === paymentRequestId,
  );
  assert.ok(request);
  const offer = book.offers.find((row) => row.reference === request.offerReference);
  assert.ok(offer?.onchain?.tokenId != null);
  const facts: VerifiedRentDepositFacts = {
    tokenId: offer.onchain.tokenId,
    opaquePaymentId: OPAQUE,
    payerAddress: PAYER,
    amountAtomic: BigInt(request.amountUsdcAtomic),
    txHash: TX_RENT,
  };
  return applyVerifiedRentDeposit(book, paymentRequestId, facts, at);
}

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

  const publicConfig = toPublicCryptoConfig(getSeedBook().cryptoConfig);
  assert.ok(publicConfig);
  assert.equal("safeAddress" in publicConfig, false);
  assert.equal("companySafeAddress" in publicConfig, false);
  assert.equal("salesProceedsSafeAddress" in publicConfig, false);
  assert.equal("offerNftContract" in publicConfig, false);
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

test("the env contract address is used every time, even after Reset clears it", () => {
  const previous = process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS;
  process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS =
    "0x1111111111111111111111111111111111111111";
  try {
    assert.equal(
      cryptoConfigFor(BASE_SEPOLIA_NETWORK_KEY, { offerNftContract: null })
        .offerNftContract?.toLowerCase(),
      "0x1111111111111111111111111111111111111111",
    );
    assert.equal(
      cryptoConfigFor(BASE_SEPOLIA_NETWORK_KEY, { offerNftContract: "0x9999999999999999999999999999999999999999" })
        .offerNftContract?.toLowerCase(),
      "0x1111111111111111111111111111111111111111",
    );
  } finally {
    if (previous == null) delete process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS;
    else process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS = previous;
  }
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
  const book = buyOffer(getSeedBook(), CANONICAL_REFERENCE, "2026-08-20T12:00:00.000Z");
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

test("Admin approval offers Enrique and Luuk", () => {
  const book = getSeedBook();
  book.actors = [];
  const approvers = normalizeBook(book).actors
    .filter((actor) => actor.role === "independent_approver")
    .map((actor) => actor.name);

  assert.deepEqual(approvers, ["Enrique", "Luuk"]);
  assert.equal(independentApproverById("act-enrique")?.name, "Enrique");
  assert.equal(independentApproverById("act-luuk")?.name, "Luuk");
  assert.equal(independentApproverById("act-girigoria"), undefined);
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

test("only verified landlord-paid offers count toward the paid total", () => {
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

  mra001.fundedCents = mra001.offeringCents;
  mra001.onchain = {
    ...mra001.onchain!,
    landlordPaid: true,
    purchased: true,
  };

  const totals = bookTotals({
    ...book,
    offers: [mra001, funding, review, draft],
  });

  assert.equal(totals.totalAdvanced, mra001.purchasePriceCents);
});

test("seeded offers are pre-mint listings with no fabricated chain state", () => {
  const book = getSeedBook();
  for (const offer of book.offers) {
    assert.equal(offer.status, "funding");
    assert.equal(offer.fundedCents, 0);
    assert.equal(offer.onchain?.tokenId, null);
    assert.equal(offer.onchain?.mintTxHash, null);
    assert.equal(offer.onchain?.purchased, false);
    assert.equal(offer.onchain?.landlordPaid, false);
    assert.equal(
      (book.paymentRequests ?? []).filter((row) => row.offerReference === offer.reference)
        .length,
      0,
    );
  }
});

test("a verified purchase mints payment requests and marks the landlord paid once", () => {
  const book = getSeedBook();
  const first = buyOffer(book, CANONICAL_REFERENCE, "2026-08-20T12:00:00.000Z");
  const offer = first.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.ok(offer);
  assert.equal(offer.status, "live");
  assert.equal(offer.fundedCents, offer.offeringCents);
  assert.equal(offer.onchain?.purchased, true);
  assert.equal(offer.onchain?.landlordPaid, true);
  assert.equal(offer.onchain?.purchaserAddress, BUYER);
  assert.equal(offer.onchain?.purchaseTxHash, TX_PURCHASE);

  const requests = (first.paymentRequests ?? []).filter(
    (row) => row.offerReference === CANONICAL_REFERENCE,
  );
  assert.equal(requests.length, 6);
  const canonical = requests.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.ok(canonical);
  assert.equal(canonical.amountUsdcAtomic, 1_800_000_000);
  assert.equal(canonical.status, "due");

  const second = applyVerifiedPurchase(
    first,
    CANONICAL_REFERENCE,
    {
      tokenId: 1,
      purchaserAddress: BUYER,
      txHash: TX_PURCHASE,
      payoutAddress: payoutAddressLocked(
        first.offers.find((row) => row.reference === CANONICAL_REFERENCE) ?? getSeedBook().offers[0],
      ) ?? "",
      purchasePriceAtomic: BigInt(1_020_600 * 10_000),
    },
    "2026-08-20T12:01:00.000Z",
  );
  const again = second.offers.find((row) => row.reference === CANONICAL_REFERENCE);
  assert.equal(
    (second.paymentRequests ?? []).filter(
      (row) => row.offerReference === CANONICAL_REFERENCE,
    ).length,
    6,
  );
  assert.equal(again?.onchain?.purchaseTxHash, TX_PURCHASE);
});

test("a designated renter wallet receives the offer payment requests", () => {
  const book = getSeedBook();
  const offer = book.offers.find((row) => row.reference === CHEAP_OFFER_REFERENCE);
  assert.ok(offer);
  offer.renterWalletAddress = PAYER;

  const purchased = buyOffer(book, CHEAP_OFFER_REFERENCE, "2026-08-20T12:00:00.000Z");
  const request = (purchased.paymentRequests ?? []).find(
    (row) => row.offerReference === CHEAP_OFFER_REFERENCE,
  );
  assert.ok(request);
  assert.equal(request.renterWalletAddress, PAYER);
});

test("confirming the same deposit cannot duplicate collection or distribution", () => {
  const book = buyOffer(getSeedBook(), CANONICAL_REFERENCE, "2026-08-20T12:00:00.000Z");
  const first = payRent(book, CANONICAL_PAYMENT_REQUEST_ID, "2026-09-28T12:00:00.000Z");
  const second = payRent(first, CANONICAL_PAYMENT_REQUEST_ID, "2026-09-28T12:01:00.000Z");
  const third = payRent(second, CANONICAL_PAYMENT_REQUEST_ID, "2026-09-28T12:02:00.000Z");

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
    const claimable = (next.distributions ?? []).find(
      (row) => row.collectionId === collectionId,
    );
    assert.equal(claimable?.status, "claimable");
    assert.equal(offer.onchain?.claimableRentCents, 180000);
  }
});

test("a verified rent deposit is pending until verification applies", () => {
  const book = buyOffer(getSeedBook(), CANONICAL_REFERENCE, "2026-08-20T12:00:00.000Z");
  const request = book.paymentRequests?.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.equal(request?.status, "due");
  assert.equal(request?.txHash, null);
  const paid = payRent(book, CANONICAL_PAYMENT_REQUEST_ID, "2026-09-28T12:00:00.000Z");
  assert.equal(
    paid.paymentRequests?.find((row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID)
      ?.status,
    "confirmed",
  );
});

test("later month cannot confirm while an earlier month is still open", () => {
  const book = buyOffer(getSeedBook(), CANONICAL_REFERENCE, "2026-08-20T12:00:00.000Z");
  const later = (book.paymentRequests ?? [])
    .filter((row) => row.offerReference === "MRA-001")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[1];

  assert.ok(later);
  const earlier = earlierOpenPaymentRequest(book, later.paymentRequestId);
  assert.equal(earlier?.paymentRequestId, CANONICAL_PAYMENT_REQUEST_ID);
  const offer = book.offers.find((row) => row.reference === "MRA-001");
  assert.throws(
    () =>
      applyVerifiedRentDeposit(book, later.paymentRequestId, {
        tokenId: offer?.onchain?.tokenId ?? 1,
        opaquePaymentId: OPAQUE,
        payerAddress: PAYER,
        amountAtomic: BigInt(later.amountUsdcAtomic),
        txHash: TX_RENT,
      }, "2026-09-28T12:00:00.000Z"),
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

test("a verified tx hash is stored on the confirmed request", () => {
  const book = buyOffer(getSeedBook(), CANONICAL_REFERENCE, "2026-08-20T12:00:00.000Z");
  const paid = payRent(book, CANONICAL_PAYMENT_REQUEST_ID, "2026-09-28T12:00:00.000Z");
  const request = paid.paymentRequests?.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.equal(request?.txHash, TX_RENT);
  assert.equal(request?.transactionId, paymentTxIdFor(CANONICAL_PAYMENT_REQUEST_ID));
});

test("no fabricated advance-settlement or landlord-claim ledger rows exist", () => {
  const book = buyOffer(getSeedBook(), CANONICAL_REFERENCE, "2026-08-20T12:00:00.000Z");
  const paid = payRent(book, CANONICAL_PAYMENT_REQUEST_ID, "2026-09-28T12:00:00.000Z");
  assert.equal(
    paid.ledgerTransactions?.some((row) => (row.kind as unknown as string) === "advance_settlement"),
    false,
  );
  assert.equal(
    paid.ledgerTransactions?.some((row) => (row.kind as unknown as string) === "landlord_claim"),
    false,
  );
  assert.equal(
    paid.ledgerTransactions?.some((row) => (row.kind as unknown as string) === "company_fee"),
    false,
  );
  const rent = paid.ledgerTransactions?.find(
    (row) => row.kind === "rent_payment" && row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.ok(rent);
  assert.equal(rent.fromLabel, "Renter wallet");
  assert.equal(rent.toLabel, "Merkado rent offer contract");
});

test("landlord attention does not include holder rent claims", () => {
  const book = normalizeBook(getSeedBook());
  assert.equal(
    attentionItems(book).some((item) => item.label === "Rent ready to claim"),
    false,
  );
  assert.equal(
    (book.distributions ?? []).filter((row) => row.status === "claimable").length,
    0,
  );
});

test("a verified deposit still updates the shared book on a Base testnet config", () => {
  const seed = normalizeBook({
    ...getSeedBook(),
    cryptoConfig: cryptoConfigFor(BASE_SEPOLIA_NETWORK_KEY),
  });
  const bought = buyOffer(seed, CANONICAL_REFERENCE, "2026-08-20T12:00:00.000Z");
  const next = payRent(bought, CANONICAL_PAYMENT_REQUEST_ID, "2026-09-28T12:00:00.000Z");
  const offer = next.offers.find((row) => row.reference === "MRA-001");
  const request = next.paymentRequests?.find(
    (row) => row.paymentRequestId === CANONICAL_PAYMENT_REQUEST_ID,
  );
  assert.equal(next.cryptoConfig?.networkKey, BASE_SEPOLIA_NETWORK_KEY);
  assert.equal(request?.status, "confirmed");
  assert.equal(offer?.receivables.find((row) => row.n === 1)?.status, "received");
  assert.equal(offer?.collections.filter((row) => row.receivableN === 1).length, 1);
  assert.equal(
    (next.distributions ?? []).filter(
      (row) => row.collectionId === collectionIdFor("MRA-001", 1),
    ).length,
    1,
  );
  assert.equal(currentRenterPaymentRequest(next)?.periodLabel, "October 2026");
});

test("next renter payment is the earliest unpaid request after a purchase", () => {
  const book = buyOffer(getSeedBook(), CANONICAL_REFERENCE, "2026-08-20T12:00:00.000Z");
  assert.equal(
    currentRenterPaymentRequest(book)?.paymentRequestId,
    CANONICAL_PAYMENT_REQUEST_ID,
  );

  const afterSeptember = payRent(book, CANONICAL_PAYMENT_REQUEST_ID, "2026-09-28T12:00:00.000Z");
  assert.equal(
    currentRenterPaymentRequest(afterSeptember)?.periodLabel,
    "October 2026",
  );
});
