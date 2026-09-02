import { getAddress, recoverMessageAddress } from "viem";

export type WalletLinkErrorCode =
  | "NOT_AUTHENTICATED"
  | "DOMAIN_MISMATCH"
  | "WRONG_CHAIN"
  | "INVALID_OR_EXPIRED"
  | "LINK_FAILED"
  | "NOT_CONFIGURED";

export class WalletLinkError extends Error {
  constructor(
    public readonly code: WalletLinkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletLinkError";
  }
}

/**
 * Resolve the domain a link challenge must be bound to.
 * NEXT_PUBLIC_SITE_URL wins when set (authoritative origin); otherwise the
 * request host header is used. Empty when neither is available.
 */
export function expectedLinkDomain(
  hostHeader?: string | null,
  siteUrl?: string | null,
): string {
  if (siteUrl?.trim()) {
    try {
      const host = new URL(siteUrl).host;
      if (host) return host;
    } catch {
      // fall through to the host header
    }
  }
  return hostHeader?.trim() ?? "";
}

export type LinkChallengeView = {
  domain: string;
  chain_id: number;
  expires_at: string;
  consumed_at: string | null;
};

/**
 * Pure signature/domain/chain validation shared by the linking service.
 * Returns the checksummed wallet address on success; throws WalletLinkError
 * on domain mismatch, wrong chain, consumed/expired nonce, or a signature
 * that does not match the claimed wallet.
 */
export async function assertValidLinkSignature(input: {
  challenge: LinkChallengeView;
  signature: string;
  walletAddress: string;
  expectedDomain: string;
  expectedChainId: number;
  message: string;
}): Promise<`0x${string}`> {
  const { challenge } = input;

  if (!input.expectedDomain) {
    throw new WalletLinkError("DOMAIN_MISMATCH", "Unable to confirm the request domain.");
  }
  if (challenge.domain !== input.expectedDomain) {
    throw new WalletLinkError(
      "DOMAIN_MISMATCH",
      "This link request is for a different website.",
    );
  }
  if (challenge.chain_id !== input.expectedChainId) {
    throw new WalletLinkError(
      "WRONG_CHAIN",
      "This link request is for a different network.",
    );
  }
  if (challenge.consumed_at) {
    throw new WalletLinkError(
      "INVALID_OR_EXPIRED",
      "This link request was already used.",
    );
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    throw new WalletLinkError(
      "INVALID_OR_EXPIRED",
      "This link request has expired. Start again.",
    );
  }

  let recovered: `0x${string}`;
  try {
    recovered = await recoverMessageAddress({
      message: input.message,
      signature: input.signature as `0x${string}`,
    });
  } catch {
    throw new WalletLinkError(
      "INVALID_OR_EXPIRED",
      "The wallet signature could not be read.",
    );
  }

  let expected: `0x${string}`;
  try {
    expected = getAddress(input.walletAddress);
  } catch {
    throw new WalletLinkError("INVALID_OR_EXPIRED", "The wallet address is not valid.");
  }

  if (recovered.toLowerCase() !== expected.toLowerCase()) {
    throw new WalletLinkError(
      "INVALID_OR_EXPIRED",
      "The signature does not match this wallet.",
    );
  }
  return expected;
}
