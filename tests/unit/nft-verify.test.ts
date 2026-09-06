import assert from "node:assert/strict";
import test, { before } from "node:test";
import { Module } from "node:module";

import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  pad,
  parseAbiParameters,
  toHex,
  type Hex,
} from "viem";

// Stub the "server-only" marker so the pure verifier modules can be loaded by
// the plain Node test runner (tsx) without Next's bundler resolution.
type ModuleInternals = {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};
const internals = Module as unknown as ModuleInternals;
const originalLoad = internals._load;
internals._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

type VerifyModule = typeof import("@/lib/onchain/verify");
type AbiModule = typeof import("@/lib/onchain/abi");

let verify: VerifyModule;
let abi: AbiModule;

type FabricatedLog = {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
  blockNumber: bigint;
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  removed: boolean;
};

const TX_HASH = "0x" + "a".repeat(64) as Hex;
const BLOCK_HASH = "0x" + "b".repeat(64) as Hex;
const CONTRACT = "0x1111111111111111111111111111111111111111";
const OTHER_CONTRACT = "0x8888888888888888888888888888888888888888";
const USDC = "0x2222222222222222222222222222222222222222";
const WRONG_USDC = "0x9999999999999999999999999999999999999999";
const PAYOUT = "0x3333333333333333333333333333333333333333";
const PAYER = "0x4444444444444444444444444444444444444444";
const BUYER = "0x5555555555555555555555555555555555555555";
const OWNER = "0x6666666666666666666666666666666666666666";
const OFFER_KEY = "0x" + "f".repeat(64) as Hex;
const PAYMENT_ID = "0x" + "e".repeat(64) as Hex;
const TOKEN_ID = BigInt(1);
const PURCHASE_PRICE = BigInt(1020600);
const RENT_INSTALLMENT = BigInt(300000);
const DEPOSIT_AMOUNT = BigInt(1800000000);
const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));

before(async () => {
  verify = await import("@/lib/onchain/verify");
  abi = await import("@/lib/onchain/abi");
});

function baseLog(
  topics: string[],
  data: string,
  address: string,
  logIndex: number,
): FabricatedLog {
  return {
    address,
    topics,
    data,
    logIndex,
    blockNumber: BigInt(1234),
    transactionHash: TX_HASH,
    transactionIndex: 1,
    blockHash: BLOCK_HASH,
    removed: false,
  };
}

function offerMintedLog(overrides: { address?: string; logIndex?: number } = {}) {
  const topics = encodeEventTopics({
    abi: abi.MERKADO_OFFER_ABI,
    eventName: "OfferMinted",
    args: { tokenId: TOKEN_ID, offerKey: OFFER_KEY },
  }) as string[];
  const data = encodeAbiParameters(
    parseAbiParameters("address,uint256,uint256"),
    [PAYOUT, PURCHASE_PRICE, RENT_INSTALLMENT],
  );
  return baseLog(topics, data, overrides.address ?? CONTRACT, overrides.logIndex ?? 0);
}

function offerPurchasedLog(overrides: { address?: string; logIndex?: number } = {}) {
  const topics = encodeEventTopics({
    abi: abi.MERKADO_OFFER_ABI,
    eventName: "OfferPurchased",
    args: { tokenId: TOKEN_ID, buyer: BUYER, payoutAddress: PAYOUT },
  }) as string[];
  const data = encodeAbiParameters(parseAbiParameters("uint256"), [PURCHASE_PRICE]);
  return baseLog(topics, data, overrides.address ?? CONTRACT, overrides.logIndex ?? 0);
}

function rentDepositedLog(overrides: { address?: string; logIndex?: number } = {}) {
  const topics = encodeEventTopics({
    abi: abi.MERKADO_OFFER_ABI,
    eventName: "RentDeposited",
    args: { tokenId: TOKEN_ID, paymentId: PAYMENT_ID, payer: PAYER },
  }) as string[];
  const data = encodeAbiParameters(parseAbiParameters("uint256"), [DEPOSIT_AMOUNT]);
  return baseLog(topics, data, overrides.address ?? CONTRACT, overrides.logIndex ?? 0);
}

function rentClaimedLog(overrides: { address?: string; logIndex?: number } = {}) {
  const topics = encodeEventTopics({
    abi: abi.MERKADO_OFFER_ABI,
    eventName: "RentClaimed",
    args: { tokenId: TOKEN_ID, owner: OWNER },
  }) as string[];
  const data = encodeAbiParameters(parseAbiParameters("uint256"), [DEPOSIT_AMOUNT]);
  return baseLog(topics, data, overrides.address ?? CONTRACT, overrides.logIndex ?? 0);
}

function usdcTransferLog(
  from: string,
  to: string,
  amount: bigint,
  emitter: string = USDC,
  logIndex = 1,
): FabricatedLog {
  return baseLog(
    [TRANSFER_TOPIC, pad(from as Hex) as string, pad(to as Hex) as string],
    toHex(amount, { size: 32 }),
    emitter,
    logIndex,
  );
}

function receipt(logs: FabricatedLog[], chainId = 10, status = "success") {
  return {
    chainId,
    status,
    transactionHash: TX_HASH,
    transactionIndex: 1,
    blockHash: BLOCK_HASH,
    blockNumber: BigInt(1234),
    cumulativeGasUsed: BigInt(21000),
    gasUsed: BigInt(21000),
    contractAddress: null,
    logs,
    logsBloom: "0x",
    root: null,
    statusReason: null,
    effectiveGasPrice: BigInt(1),
    type: "eip1559",
    from: PAYER,
    to: CONTRACT,
  };
}

const MINTED_EXPECTED = {
  contractAddress: CONTRACT,
  tokenId: TOKEN_ID,
  offerKey: OFFER_KEY,
  payoutAddress: PAYOUT,
  purchasePrice: PURCHASE_PRICE,
  rentInstallmentAmount: RENT_INSTALLMENT,
};

const PURCHASED_EXPECTED = {
  contractAddress: CONTRACT,
  tokenId: TOKEN_ID,
  buyer: BUYER,
  payoutAddress: PAYOUT,
  purchasePrice: PURCHASE_PRICE,
};

const DEPOSIT_EXPECTED = {
  contractAddress: CONTRACT,
  tokenId: TOKEN_ID,
  paymentId: PAYMENT_ID,
  payer: PAYER,
  amount: DEPOSIT_AMOUNT,
  usdcAddress: USDC,
};

const CLAIMED_EXPECTED = {
  contractAddress: CONTRACT,
  tokenId: TOKEN_ID,
  owner: OWNER,
  amount: DEPOSIT_AMOUNT,
};

test("confirmation math counts the mined block itself", () => {
  assert.equal(verify.confirmationsFor(BigInt(100), BigInt(105)), BigInt(6));
  assert.equal(verify.confirmationsFor(BigInt(100), BigInt(100)), BigInt(1));
  assert.equal(verify.MERKADO_CONFIRMATION_BLOCKS, 5);
});

test("a matching OfferMinted receipt verifies with log index 0 preserved", () => {
  const result = verify.verifyOfferMintedReceipt(
    receipt([offerMintedLog({ logIndex: 0 })]),
    MINTED_EXPECTED,
  );
  assert.equal(result.verified, true);
  assert.equal(result.status, "confirmed");
  assert.equal(result.logIndex, 0);
  assert.equal(result.tokenId, TOKEN_ID);
  assert.equal(result.blockNumber, BigInt(1234));
});

test("32-byte padded indexed topics are decoded to real values", () => {
  const minted = verify.verifyOfferMintedReceipt(
    receipt([offerMintedLog()]),
    MINTED_EXPECTED,
  );
  assert.equal(minted.verified, true);
  assert.equal(minted.status, "confirmed");

  const purchased = verify.verifyOfferPurchasedReceipt(
    receipt([offerPurchasedLog()]),
    PURCHASED_EXPECTED,
  );
  assert.equal(purchased.verified, true);

  const deposited = verify.verifyRentDepositReceipt(
    receipt([rentDepositedLog(), usdcTransferLog(PAYER, CONTRACT, DEPOSIT_AMOUNT)]),
    DEPOSIT_EXPECTED,
  );
  assert.equal(deposited.verified, true);

  const claimed = verify.verifyRentClaimedReceipt(
    receipt([rentClaimedLog()]),
    CLAIMED_EXPECTED,
  );
  assert.equal(claimed.verified, true);
});

test("an amount mismatch fails verification", () => {
  const wrongData = encodeAbiParameters(
    parseAbiParameters("address,uint256,uint256"),
    [PAYOUT, PURCHASE_PRICE + BigInt(1), RENT_INSTALLMENT],
  );
  const log = { ...offerMintedLog(), data: wrongData };
  const result = verify.verifyOfferMintedReceipt(receipt([log]), MINTED_EXPECTED);
  assert.equal(result.verified, false);
  assert.equal(result.status, "failed");
  assert.match(result.reason ?? "", /missing event/i);
});

test("an event from the wrong contract is rejected as wrong contract", () => {
  const result = verify.verifyOfferMintedReceipt(
    receipt([offerMintedLog({ address: OTHER_CONTRACT })]),
    MINTED_EXPECTED,
  );
  assert.equal(result.verified, false);
  assert.equal(result.status, "failed");
  assert.match(result.reason ?? "", /wrong contract/i);
});

test("a receipt without the expected event is rejected as missing event", () => {
  const result = verify.verifyOfferMintedReceipt(
    receipt([rentDepositedLog()]),
    MINTED_EXPECTED,
  );
  assert.equal(result.verified, false);
  assert.equal(result.status, "failed");
  assert.match(result.reason ?? "", /missing event/i);
});

test("a reverted receipt is rejected", () => {
  const result = verify.verifyOfferMintedReceipt(
    receipt([offerMintedLog()], 10, "reverted"),
    MINTED_EXPECTED,
  );
  assert.equal(result.verified, false);
  assert.equal(result.status, "failed");
  assert.match(result.reason ?? "", /reverted/i);
});

test("a receipt from the wrong chain is rejected", () => {
  const result = verify.verifyOfferMintedReceipt(
    receipt([offerMintedLog()], 84532),
    MINTED_EXPECTED,
  );
  assert.equal(result.verified, false);
  assert.equal(result.status, "failed");
  assert.match(result.reason ?? "", /wrong chain/i);
});

test("a transfer to the contract from a non-USDC token is rejected", () => {
  const wrongUsdcLog = usdcTransferLog(PAYER, CONTRACT, DEPOSIT_AMOUNT, WRONG_USDC);
  const result = verify.verifyRentDepositReceipt(
    receipt([rentDepositedLog(), wrongUsdcLog]),
    DEPOSIT_EXPECTED,
  );
  assert.equal(result.verified, false);
  assert.equal(result.status, "failed");
  assert.match(result.reason ?? "", /wrong USDC/i);
  assert.equal(verify.findWrongUsdcTransfer([wrongUsdcLog], USDC, CONTRACT), true);
  assert.equal(
    verify.findWrongUsdcTransfer(
      [usdcTransferLog(PAYER, CONTRACT, DEPOSIT_AMOUNT)],
      USDC,
      CONTRACT,
    ),
    false,
  );
});

test("a missing transaction maps to the pending result", () => {
  const pending = verify.pendingVerificationResult(TX_HASH, CONTRACT);
  assert.equal(pending.verified, false);
  assert.equal(pending.status, "pending");
  assert.equal(pending.reason, "Transaction not found yet");
  assert.equal(pending.chainId, 10);
  assert.equal(pending.contractAddress, CONTRACT);
  assert.equal(pending.txHash, TX_HASH);
});

test("log index 0 is never treated as absent in the matching path", () => {
  const withZeroIndex = verify.verifyRentDepositReceipt(
    receipt([
      rentDepositedLog({ logIndex: 0 }),
      usdcTransferLog(PAYER, CONTRACT, DEPOSIT_AMOUNT, USDC, 1),
    ]),
    DEPOSIT_EXPECTED,
  );
  assert.equal(withZeroIndex.verified, true);
  assert.equal(withZeroIndex.logIndex, 0);
});
test("confirmation depth gate: 5 blocks required, fewer stays not-ready", () => {
  assert.equal(verify.confirmationsReady(null), false);
  assert.equal(verify.confirmationsReady(BigInt(0)), false);
  assert.equal(verify.confirmationsReady(BigInt(4)), false);
  assert.equal(verify.confirmationsReady(BigInt(5)), true);
  assert.equal(verify.confirmationsReady(BigInt(6)), true);
});
