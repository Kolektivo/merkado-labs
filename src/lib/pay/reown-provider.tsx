"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import {
  isReownConfigured,
  reownWagmiAdapter,
} from "@/lib/pay/reown-config";

const queryClient = new QueryClient();

/**
 * Mounts the Reown AppKit (external wallets only) around the app. When
 * NEXT_PUBLIC_REOWN_PROJECT_ID is empty the shell is a passthrough and the
 * wallet layer falls back to the injected EIP-1193 path.
 */
export function ReownProvider({ children }: { children: React.ReactNode }) {
  if (!isReownConfigured() || !reownWagmiAdapter) {
    return <>{children}</>;
  }
  return (
    <WagmiProvider config={reownWagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
