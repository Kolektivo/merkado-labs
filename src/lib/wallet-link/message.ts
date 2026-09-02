import { payNetworkByChainId } from "@/lib/pay/networks";

export const LINK_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function linkStatement(): string {
  return "Sign this message to link your wallet to your Merkado Labs demo account.";
}

export function chainLabelFor(chainId: number): string {
  return payNetworkByChainId(chainId)?.networkLabel ?? `Chain ${chainId}`;
}

export type LinkMessageParams = {
  statement: string;
  accountId: string;
  domain: string;
  chainId: number;
  nonce: string;
};

/**
 * The exact message the wallet signs (personal_sign). The server rebuilds
 * this deterministically from the stored challenge, so every field binds the
 * request: account, domain, chain, and nonce.
 */
export function buildLinkMessage(params: LinkMessageParams): string {
  return [
    "Merkado Labs — link your wallet",
    "",
    params.statement,
    "",
    `Account: ${params.accountId}`,
    `Domain: ${params.domain}`,
    `Chain: ${chainLabelFor(params.chainId)} (${params.chainId})`,
    `Nonce: ${params.nonce}`,
    "",
    "Link requests expire after 5 minutes.",
  ].join("\n");
}
