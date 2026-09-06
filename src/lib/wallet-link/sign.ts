import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { optimism } from "viem/chains";

/**
 * Sign the linking challenge with the connected wallet using the existing
 * EIP-1193 provider (Reown/AppKit or the injected wallet). viem's string
 * `signMessage` uses personal_sign, which is what the server verifies.
 */
export async function signLinkMessage(
  provider: EIP1193Provider,
  address: `0x${string}`,
  message: string,
): Promise<`0x${string}`> {
  const client = createWalletClient({
    account: address,
    chain: optimism,
    transport: custom(provider),
  });
  return client.signMessage({ message });
}
