import { randomBytes } from "node:crypto";

import { encodePacked, getAddress, isHash, keccak256, toHex } from "viem";

const RENT_DOMAIN_PREFIX = "MERKADO_RENT_V1";
const OFFER_DOMAIN_PREFIX = "MERKADO_OFFER_V1";

export type OpaquePaymentIdInput = {
  chainId: number;
  contractAddress: string;
  epochId: string;
  /** Optional explicit 32-byte nonce for deterministic tests. */
  randomNonce?: string;
};

function toBytes32(value: string): string {
  if (isHash(value)) return value;
  return keccak256(toHex(value));
}

/**
 * Opaque bytes32 payment id for a rent deposit. Never embeds business
 * identifiers or human-readable data; only a fixed domain tag, chain,
 * contract, epoch, and a random 32-byte nonce.
 */
export function opaquePaymentId(input: OpaquePaymentIdInput): string {
  const nonce = input.randomNonce ?? toHex(randomBytes(32));
  return keccak256(
    encodePacked(
      ["string", "uint256", "address", "bytes32", "bytes32"],
      [
        RENT_DOMAIN_PREFIX,
        BigInt(input.chainId),
        getAddress(input.contractAddress),
        toBytes32(input.epochId) as `0x${string}`,
        nonce as `0x${string}`,
      ],
    ),
  );
}

export type OfferKeyInput = {
  chainId: number;
  contractAddress: string;
  /** Internal business id is hashed, never exposed. */
  internalId: string;
};

/**
 * Opaque bytes32 offer key derived from a hash. The output never contains
 * human-readable data or the internal id.
 */
export function offerKey(input: OfferKeyInput): string {
  return keccak256(
    encodePacked(
      ["string", "uint256", "address", "string"],
      [
        OFFER_DOMAIN_PREFIX,
        BigInt(input.chainId),
        getAddress(input.contractAddress),
        input.internalId,
      ],
    ),
  );
}

/** Fresh random opaque bytes32 offer key. */
export function randomOfferKey(): string {
  return keccak256(toHex(randomBytes(32)));
}