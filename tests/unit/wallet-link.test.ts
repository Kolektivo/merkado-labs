import assert from "node:assert/strict";
import test from "node:test";

import { privateKeyToAccount } from "viem/accounts";

import {
  buildLinkMessage,
  chainLabelFor,
  linkStatement,
  LINK_CHALLENGE_TTL_MS,
} from "@/lib/wallet-link/message";
import {
  assertValidLinkSignature,
  expectedLinkDomain,
  WalletLinkError,
} from "@/lib/wallet-link/verify";

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const DOMAIN = "merkado-labs.vercel.app";
const CHAIN_ID = 84532;
const NONCE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
// anvil account #0 — a well-known test private key
const PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function sampleMessage(): string {
  return buildLinkMessage({
    statement: linkStatement(),
    accountId: ACCOUNT_ID,
    domain: DOMAIN,
    chainId: CHAIN_ID,
    nonce: NONCE,
  });
}

function sampleChallenge(overrides: Record<string, unknown> = {}) {
  return {
    domain: DOMAIN,
    chain_id: CHAIN_ID,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
    ...overrides,
  };
}

test("LINK_CHALLENGE_TTL_MS is five minutes", () => {
  assert.equal(LINK_CHALLENGE_TTL_MS, 5 * 60 * 1000);
});

test("buildLinkMessage binds account, domain, chain and nonce", () => {
  const message = sampleMessage();
  assert.match(message, /Merkado Labs — link your wallet/);
  assert.ok(message.includes(ACCOUNT_ID), "message must bind the account id");
  assert.ok(message.includes(DOMAIN), "message must bind the domain");
  assert.ok(message.includes("Base Sepolia (84532)"), "message must bind the chain");
  assert.ok(message.includes(NONCE), "message must bind the nonce");
  assert.ok(message.includes(linkStatement()), "message must include the statement");
});

test("chainLabelFor resolves Base Sepolia by chain id", () => {
  assert.equal(chainLabelFor(84532), "Base Sepolia");
  assert.equal(chainLabelFor(999), "Chain 999");
});

test("expectedLinkDomain requires the configured site URL host", () => {
  assert.equal(
    expectedLinkDomain("localhost:3000", "https://merkado-labs.vercel.app/"),
    "merkado-labs.vercel.app",
  );
  assert.equal(expectedLinkDomain("localhost:3000", null), "");
  assert.equal(expectedLinkDomain(null, "not-a-url"), "");
  assert.equal(expectedLinkDomain("", ""), "");
});

test("assertValidLinkSignature accepts a genuine wallet signature", async () => {
  const signer = privateKeyToAccount(PRIVATE_KEY);
  const message = sampleMessage();
  const signature = await signer.signMessage({ message });

  const recovered = await assertValidLinkSignature({
    challenge: sampleChallenge(),
    signature,
    walletAddress: signer.address,
    expectedDomain: DOMAIN,
    expectedChainId: CHAIN_ID,
    message,
  });

  assert.equal(recovered.toLowerCase(), signer.address.toLowerCase());
});

test("assertValidLinkSignature rejects another wallet's signature", async () => {
  const signer = privateKeyToAccount(PRIVATE_KEY);
  const other = privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  );
  const message = sampleMessage();
  const signature = await signer.signMessage({ message });

  await assert.rejects(
    assertValidLinkSignature({
      challenge: sampleChallenge(),
      signature,
      walletAddress: other.address,
      expectedDomain: DOMAIN,
      expectedChainId: CHAIN_ID,
      message,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WalletLinkError);
      assert.equal(error.code, "INVALID_OR_EXPIRED");
      return true;
    },
  );
});

test("assertValidLinkSignature rejects a wrong domain", async () => {
  const signer = privateKeyToAccount(PRIVATE_KEY);
  const message = sampleMessage();
  const signature = await signer.signMessage({ message });

  await assert.rejects(
    assertValidLinkSignature({
      challenge: sampleChallenge(),
      signature,
      walletAddress: signer.address,
      expectedDomain: "evil.example.com",
      expectedChainId: CHAIN_ID,
      message,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WalletLinkError);
      assert.equal(error.code, "DOMAIN_MISMATCH");
      return true;
    },
  );
});

test("assertValidLinkSignature rejects a wrong chain", async () => {
  const signer = privateKeyToAccount(PRIVATE_KEY);
  const message = sampleMessage();
  const signature = await signer.signMessage({ message });

  await assert.rejects(
    assertValidLinkSignature({
      challenge: sampleChallenge(),
      signature,
      walletAddress: signer.address,
      expectedDomain: DOMAIN,
      expectedChainId: 1,
      message,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WalletLinkError);
      assert.equal(error.code, "WRONG_CHAIN");
      return true;
    },
  );
});

test("assertValidLinkSignature rejects a consumed (replayed) challenge", async () => {
  const signer = privateKeyToAccount(PRIVATE_KEY);
  const message = sampleMessage();
  const signature = await signer.signMessage({ message });

  await assert.rejects(
    assertValidLinkSignature({
      challenge: sampleChallenge({ consumed_at: new Date().toISOString() }),
      signature,
      walletAddress: signer.address,
      expectedDomain: DOMAIN,
      expectedChainId: CHAIN_ID,
      message,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WalletLinkError);
      assert.equal(error.code, "INVALID_OR_EXPIRED");
      return true;
    },
  );
});

test("assertValidLinkSignature rejects an expired challenge", async () => {
  const signer = privateKeyToAccount(PRIVATE_KEY);
  const message = sampleMessage();
  const signature = await signer.signMessage({ message });

  await assert.rejects(
    assertValidLinkSignature({
      challenge: sampleChallenge({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
      signature,
      walletAddress: signer.address,
      expectedDomain: DOMAIN,
      expectedChainId: CHAIN_ID,
      message,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WalletLinkError);
      assert.equal(error.code, "INVALID_OR_EXPIRED");
      return true;
    },
  );
});

test("assertValidLinkSignature rejects an empty expected domain", async () => {
  const signer = privateKeyToAccount(PRIVATE_KEY);
  const message = sampleMessage();
  const signature = await signer.signMessage({ message });

  await assert.rejects(
    assertValidLinkSignature({
      challenge: sampleChallenge(),
      signature,
      walletAddress: signer.address,
      expectedDomain: "",
      expectedChainId: CHAIN_ID,
      message,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WalletLinkError);
      assert.equal(error.code, "DOMAIN_MISMATCH");
      return true;
    },
  );
});
