import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { Module } from "node:module";

import { isPendingMintOffer } from "@/lib/rent-advance/helpers";
import { usdcAtomicFromUsdCents } from "@/lib/rent-advance/money";
import { getSeedBook } from "@/lib/rent-advance/seed";

// Stub the "server-only" marker so server-only modules can be loaded by the
// plain Node test runner (tsx) without Next's bundler resolution.
type ModuleInternals = {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};
const internals = Module as unknown as ModuleInternals;
const originalLoad = internals._load;
internals._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

type ConfigModule = typeof import("@/lib/onchain/config");
let config: ConfigModule;
let networks: typeof import("@/lib/pay/networks");

beforeEach(async () => {
  config = await import("@/lib/onchain/config");
  networks = await import("@/lib/pay/networks");
});

test("not-configured helpers throw MerkadoConfigurationError with the env unset", () => {
  const previous = process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS;
  delete process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS;
  try {
    assert.equal(config.isMerkadoConfigured(), false);
    assert.throws(
      () => config.assertMerkadoConfigured(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, "MerkadoConfigurationError");
        assert.match(error.message, /NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS/);
        return true;
      },
    );
    assert.throws(
      () => config.merkadoContractAddress(),
      (error: unknown) => {
        assert.equal((error as Error).name, "MerkadoConfigurationError");
        return true;
      },
    );
    assert.equal(networks.merkadoContractAddressOrNull(), null);
  } finally {
    process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS = previous;
  }
});

test("config resolves a valid checksummed contract address when set", () => {
  const previous = process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS;
  process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111";
  try {
    assert.equal(config.isMerkadoConfigured(), true);
    assert.equal(
      config.merkadoContractAddress(),
      "0x1111111111111111111111111111111111111111",
    );
    assert.equal(
      networks.merkadoContractAddressOrNull(),
      "0x1111111111111111111111111111111111111111",
    );
  } finally {
    process.env.NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS = previous;
  }
});

test("company operator defaults to the deployed Optimism Mainnet minter", () => {
  const safe = networks.resolvedCompanySafe();
  assert.equal(
    safe.toLowerCase(),
    "0x27D9333E178BEeaA92EE0e5C80DE75C133eA19E5".toLowerCase(),
  );
});

test("atomic conversions stay 1:1 between USD cents and USDC atomic units", () => {
  assert.equal(usdcAtomicFromUsdCents(100), 1_000_000);
  assert.equal(usdcAtomicFromUsdCents(180000), 1_800_000_000);
});


test("both seeded approved offers are selected for automatic minting", () => {
  const pending = getSeedBook().offers.filter(isPendingMintOffer);
  assert.deepEqual(
    pending.map((offer) => offer.reference),
    ["MRA-001", "MRA-010"],
  );
});
