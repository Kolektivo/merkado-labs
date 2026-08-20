"use client";

import { useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useAppKitAccount, useAppKitNetwork, useAppKitProvider } from "@reown/appkit/react";
import type { EIP1193Provider } from "viem";

import {
  appKit,
  isReownConfigured,
  openReownModal,
  reownWagmiAdapter,
} from "@/lib/pay/reown-config";
import { WalletBridgeContext, type WalletBridge } from "@/lib/pay/wallet-bridge";

const queryClient = new QueryClient();

/**
 * Wraps the Pay surface so external wallet connection works through Reown
 * AppKit. When `NEXT_PUBLIC_REOWN_PROJECT_ID` is empty the shell falls back
 * to a plain passthrough, so the mock rail keeps working with no wallet
 * login at all.
 */
export function ReownShell({ children }: { children: React.ReactNode }) {
  if (!isReownConfigured() || !reownWagmiAdapter) {
    return (
      <WalletBridgeContext.Provider
        value={{
          provider: null,
          address: null,
          chainId: null,
          ready: false,
          open: () => undefined,
        }}
      >
        {children}
      </WalletBridgeContext.Provider>
    );
  }

  return (
    <WagmiProvider config={reownWagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletBridgeProvider>{children}</WalletBridgeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/**
 * Publishes the connected external wallet's EIP-1193 provider and account
 * facts into the neutral `WalletBridge` context. External wallets only.
 */
function WalletBridgeProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAppKitAccount();
  const { chainId } = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider("eip155");

  const bridge = useMemo<WalletBridge>(
    () => ({
      provider: (walletProvider as EIP1193Provider | undefined) ?? null,
      address: isConnected ? address ?? null : null,
      chainId: typeof chainId === "number" ? chainId : null,
      ready: Boolean(appKit),
      open: () => openReownModal(),
    }),
    [address, isConnected, chainId, walletProvider],
  );

  return (
    <WalletBridgeContext.Provider value={bridge}>{children}</WalletBridgeContext.Provider>
  );
}