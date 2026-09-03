import assert from "node:assert/strict";
import test, { before } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { Module } from "node:module";

type ModuleInternals = { _load(request: string, parent: unknown, isMain: boolean): unknown };
const internals = Module as unknown as ModuleInternals;
const originalLoad = internals._load;
internals._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

type IdentityModule = typeof import("@/lib/wallet/identity");
let identity: IdentityModule;
before(async () => {
  identity = await import("@/lib/wallet/identity");
});

const account = privateKeyToAccount("0x0123456789012345678901234567890123456789012345678901234567890123");
const now = new Date("2026-09-02T12:00:00.000Z");

test("challenge message binds address, domain, and Base Sepolia", () => {
  const message = identity.walletChallengeMessage({ address: account.address, domain: "localhost:3000", nonce: "0xabc", issuedAt: now.toISOString(), expirationTime: new Date(now.getTime() + 300000).toISOString() });
  assert.match(message, /Chain ID: 84532/);
  assert.match(message, /localhost:3000 wants you/);
  assert.match(message, new RegExp(account.address));
});

test("valid signature is accepted and an expired challenge is rejected", async () => {
  const message = identity.walletChallengeMessage({ address: account.address, domain: "example.test", nonce: "0xdef", issuedAt: now.toISOString(), expirationTime: new Date(now.getTime() + 300000).toISOString() });
  const signature = await account.signMessage({ message });
  const row = { address: account.address.toLowerCase(), domain: "example.test", chain_id: 84532, nonce: "0xdef", message, issued_at: now.toISOString(), expires_at: new Date(now.getTime() + 300000).toISOString(), consumed_at: null };
  const db = fakeDb(row);
  assert.equal((await identity.verifyWalletChallenge({ address: account.address, domain: "example.test", nonce: row.nonce, signature, now }, db)).address, account.address);
  await assert.rejects(() => identity.verifyWalletChallenge({ address: account.address, domain: row.domain, nonce: row.nonce, signature, now }, db));
  await assert.rejects(() => identity.verifyWalletChallenge({ address: account.address, domain: row.domain, nonce: row.nonce, signature, now: new Date(now.getTime() + 301000) }, fakeDb(row)));
});

test("session cookies expire, bind to domain, and reject tampering", () => {
  process.env.WALLET_SESSION_SECRET = "test-secret-for-wallet-sessions-32chars";
  const cookie = identity.createWalletSessionCookie({ address: account.address, domain: "example.test", chainId: 84532 }, now);
  assert.equal(identity.readWalletSessionCookie(cookie.value, "example.test", now)?.address, account.address);
  assert.equal(identity.readWalletSessionCookie(cookie.value, "other.test", now), null);
  assert.equal(identity.readWalletSessionCookie(cookie.value, "example.test", new Date(now.getTime() + 7 * 86400000 + 1000)), null);
  assert.equal(identity.readWalletSessionCookie(`${cookie.value}x`, "example.test", now), null);
});

function fakeDb(row: Record<string, unknown>) {
  let consumed = false;
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: consumed ? null : row,
                  error: null,
                }),
              };
            },
          };
        },
        update() {
          return {
            eq() {
              return {
                is() {
                  return {
                    gt() {
                      return {
                        select() {
                          return {
                            maybeSingle: async () => {
                              if (consumed) return { data: null, error: null };
                              consumed = true;
                              return { data: row, error: null };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as never;
}
