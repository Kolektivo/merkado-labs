import assert from "node:assert/strict";
import test from "node:test";

import { decodeFunctionData, pad, toHex, type EIP1193Provider } from "viem";

import type { MerkadoWallet } from "@/hooks/use-merkado-wallet";
import { OP_MAINNET_CHAIN_ID, OP_MAINNET_USDC_CONTRACT } from "@/lib/pay/networks";
import {
  MERKADO_ABI,
  USDC_ABI,
  approveUsdc,
  claimRent,
  depositRent,
  ensureOptimismMainnet,
  merkadoContractAddress,
  purchaseOffer,
} from "@/lib/pay/wallet-adapter";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const USDC = OP_MAINNET_USDC_CONTRACT;
const FROM = "0x2222222222222222222222222222222222222222";
const PAYMENT_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const TX_HASH =
  "0x3333333333333333333333333333333333333333333333333333333333333333";
const WRONG_CHAIN = 1;
const AMOUNT_1800_USDC = BigInt(1_800_000_000);
const AMOUNT_100_USDC = BigInt(100_000_000);

process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS = CONTRACT;

type RequestRecord = { method: string; params?: unknown };

function fakeProvider(opts: {
  chainId?: string;
  receiptStatus?: "0x0" | "0x1";
  claimOwner?: `0x${string}`;
  claimableAmount?: bigint;
  failRequest?: { method: string; error: unknown };
} = {}): { provider: EIP1193Provider; requests: RequestRecord[] } {
  const requests: RequestRecord[] = [];
  let ethCallCount = 0;
  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown }) => {
      requests.push({ method, params });
      if (opts.failRequest && opts.failRequest.method === method) {
        throw opts.failRequest.error;
      }
      switch (method) {
        case "eth_sendTransaction":
          return TX_HASH;
        case "eth_chainId":
           return opts.chainId ?? "0xA";
        case "wallet_switchEthereumChain":
          return null;
        case "eth_accounts":
          return [FROM];
        case "eth_requestAccounts":
          return [FROM];
        case "eth_gasPrice":
          return "0x3b9aca00";
        case "eth_maxPriorityFeePerGas":
          return "0x3b9aca00";
        case "eth_estimateGas":
          return "0x5208";
        case "eth_getTransactionCount":
          return "0x0";
        case "eth_getTransactionReceipt":
          return { status: opts.receiptStatus ?? "0x1", transactionHash: TX_HASH };
        case "eth_call":
          ethCallCount += 1;
          return ethCallCount === 1
            ? pad((opts.claimOwner ?? FROM) as `0x${string}`)
            : toHex(opts.claimableAmount ?? AMOUNT_100_USDC, { size: 32 });
        default:
          throw new Error(`Unhandled request method: ${method}`);
      }
    },
    on: () => undefined,
    removeListener: () => undefined,
  };
  return { provider: provider as unknown as EIP1193Provider, requests };
}

function makeWallet(overrides: {
  provider?: EIP1193Provider | null;
  chainId?: number | null;
  address?: `0x${string}` | null;
} = {}): MerkadoWallet {
  return {
    provider: overrides.provider ?? null,
    address: overrides.address ?? FROM,
    chainId: overrides.chainId ?? OP_MAINNET_CHAIN_ID,
    isConnected: Boolean(overrides.provider && overrides.address),
    connecting: false,
    connect: async () => undefined,
    disconnect: () => undefined,
  };
}

function sentTransaction(requests: RequestRecord[]): {
  from: string;
  to: string;
  data: `0x${string}`;
} {
  const sent = requests.find((row) => row.method === "eth_sendTransaction");
  assert.ok(sent, "expected an eth_sendTransaction request");
  const params = Array.isArray(sent.params) ? sent.params : [];
  const tx = params[0] as { from: string; to: string; data: `0x${string}` };
  assert.ok(tx, "expected transaction params");
  return tx;
}

test("ensureOptimismMainnet passes on Optimism Mainnet without an RPC call", async () => {
  const { provider, requests } = fakeProvider();
  await ensureOptimismMainnet(makeWallet({ provider, chainId: OP_MAINNET_CHAIN_ID }));
  assert.equal(
    requests.some((row) => row.method === "eth_chainId"),
    false,
  );
});

test("ensureOptimismMainnet rejects a wrong chain with a user-safe message", async () => {
  const { provider } = fakeProvider();
  await assert.rejects(
    ensureOptimismMainnet(makeWallet({ provider, chainId: WRONG_CHAIN })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /wrong network/);
      assert.match(error.message, /Optimism Mainnet/);
      assert.match(error.message, /10/);
      return true;
    },
  );
});

test("ensureOptimismMainnet switches to Optimism Mainnet when requested", async () => {
  const { provider, requests } = fakeProvider();
  await ensureOptimismMainnet(makeWallet({ provider, chainId: WRONG_CHAIN }), true);
  const switchCall = requests.find((row) => row.method === "wallet_switchEthereumChain");
  assert.ok(switchCall, "expected wallet_switchEthereumChain");
  assert.deepEqual(switchCall.params, [{ chainId: "0xA" }]);
});

test("ensureOptimismMainnet maps a rejected network switch to a user-safe error", async () => {
  const { provider } = fakeProvider({
    failRequest: {
      method: "wallet_switchEthereumChain",
      error: Object.assign(new Error("User rejected the request"), { code: 4001 }),
    },
  });
  await assert.rejects(
    ensureOptimismMainnet(makeWallet({ provider, chainId: WRONG_CHAIN }), true),
    /Network switch was rejected in your wallet\./,
  );
});

test("ensureOptimismMainnet requires a provider before checking the chain", async () => {
  await assert.rejects(
    ensureOptimismMainnet(makeWallet({ provider: null })),
    /Connect a wallet first\./,
  );
});

test("merkadoContractAddress reads the env and validates the address", () => {
  assert.equal(merkadoContractAddress(), CONTRACT);

  const previous = process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS;
  delete process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS;
  try {
    assert.throws(merkadoContractAddress, /NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS/);
    process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS = "not-an-address";
    assert.throws(merkadoContractAddress, /20-byte 0x address/);
  } finally {
    process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS = previous;
  }
});

test("approveUsdc approves the Merkado contract for the exact atomic amount", async () => {
  const { provider, requests } = fakeProvider();
  const result = await approveUsdc(
     makeWallet({ provider, chainId: OP_MAINNET_CHAIN_ID }),
    AMOUNT_1800_USDC,
  );

  assert.equal(result.hash, TX_HASH);
  assert.equal(result.from, FROM);

  const tx = sentTransaction(requests);
  assert.equal(tx.to.toLowerCase(), USDC.toLowerCase());
  assert.equal(tx.from.toLowerCase(), FROM.toLowerCase());

  const decoded = decodeFunctionData({ abi: USDC_ABI, data: tx.data });
  assert.equal(decoded.functionName, "approve");
  assert.equal(decoded.args[0], CONTRACT);
  assert.equal(decoded.args[1], AMOUNT_1800_USDC);
  const sendIndex = requests.findIndex((row) => row.method === "eth_sendTransaction");
  const receiptIndex = requests.findIndex((row) => row.method === "eth_getTransactionReceipt");
  assert.ok(receiptIndex > sendIndex, "approval must wait for its receipt before returning");
});

test("approveUsdc stops the dependent flow when the approval reverts", async () => {
  const { provider } = fakeProvider({ receiptStatus: "0x0" });
  await assert.rejects(
    approveUsdc(makeWallet({ provider }), AMOUNT_100_USDC),
    /USDC approval failed on Optimism Mainnet/,
  );
});

test("purchaseOffer encodes purchase(tokenId)", async () => {
  const tokenId = BigInt(1);
  const { provider, requests } = fakeProvider();
  const result = await purchaseOffer(makeWallet({ provider }), tokenId);

  assert.equal(result.hash, TX_HASH);
  assert.equal(result.from, FROM);

  const tx = sentTransaction(requests);
  assert.equal(tx.to.toLowerCase(), CONTRACT.toLowerCase());

  const decoded = decodeFunctionData({ abi: MERKADO_ABI, data: tx.data });
  assert.equal(decoded.functionName, "purchase");
  assert.equal(decoded.args[0], tokenId);
});

test("depositRent encodes depositRent(tokenId, paymentId, amountAtomic)", async () => {
  const tokenId = BigInt(2);
  const { provider, requests } = fakeProvider();
  const result = await depositRent(makeWallet({ provider }), {
    tokenId,
    paymentId: PAYMENT_ID,
    amountAtomic: AMOUNT_100_USDC,
  });

  assert.equal(result.hash, TX_HASH);
  assert.equal(result.from, FROM);

  const tx = sentTransaction(requests);
  assert.equal(tx.to.toLowerCase(), CONTRACT.toLowerCase());

  const decoded = decodeFunctionData({ abi: MERKADO_ABI, data: tx.data });
  assert.equal(decoded.functionName, "depositRent");
  assert.equal(decoded.args[0], tokenId);
  assert.equal(decoded.args[1], PAYMENT_ID);
  assert.equal(decoded.args[2], AMOUNT_100_USDC);
});

test("claimRent preflights ownership and claimable rent before encoding claimRent", async () => {
  const tokenId = BigInt(3);
  const { provider, requests } = fakeProvider();
  const result = await claimRent(makeWallet({ provider }), tokenId);

  assert.equal(result.hash, TX_HASH);
  assert.equal(result.from, FROM);

  const tx = sentTransaction(requests);
  assert.equal(tx.to.toLowerCase(), CONTRACT.toLowerCase());

  const decoded = decodeFunctionData({ abi: MERKADO_ABI, data: tx.data });
  assert.equal(decoded.functionName, "claimRent");
  assert.equal(decoded.args[0], tokenId);
});

test("claimRent rejects a wallet that is not the current holder", async () => {
  const { provider, requests } = fakeProvider({
    claimOwner: "0x4444444444444444444444444444444444444444",
  });
  await assert.rejects(
    claimRent(makeWallet({ provider }), BigInt(3)),
    /not the current holder/,
  );
  assert.equal(requests.some((row) => row.method === "eth_sendTransaction"), false);
});

test("claimRent rejects when the contract has no claimable rent", async () => {
  const { provider, requests } = fakeProvider({ claimableAmount: BigInt(0) });
  await assert.rejects(
    claimRent(makeWallet({ provider }), BigInt(3)),
    /no rent available to claim/,
  );
  assert.equal(requests.some((row) => row.method === "eth_sendTransaction"), false);
});

test("a wallet-rejected transaction surfaces a friendly user-safe error", async () => {
  const { provider } = fakeProvider({
    failRequest: {
      method: "eth_sendTransaction",
      error: Object.assign(new Error("User rejected the request"), { code: 4001 }),
    },
  });
  await assert.rejects(
    approveUsdc(makeWallet({ provider }), AMOUNT_100_USDC),
    /The transaction was cancelled in your wallet\./,
  );
});

test("write helpers require a connected wallet", async () => {
  const disconnected = makeWallet({ provider: null, address: null });
  await assert.rejects(purchaseOffer(disconnected, BigInt(1)), /Connect a wallet first\./);
  await assert.rejects(
    depositRent(disconnected, {
      tokenId: BigInt(1),
      paymentId: PAYMENT_ID,
      amountAtomic: BigInt(1),
    }),
    /Connect a wallet first\./,
  );
  await assert.rejects(claimRent(disconnected, BigInt(1)), /Connect a wallet first\./);
});

test("write helpers reject a wrong chain before sending", async () => {
  const { provider } = fakeProvider();
  const wrongNetwork = makeWallet({ provider, chainId: WRONG_CHAIN });
  await assert.rejects(purchaseOffer(wrongNetwork, BigInt(1)), /wrong network/);
  await assert.rejects(claimRent(wrongNetwork, BigInt(1)), /wrong network/);
});
