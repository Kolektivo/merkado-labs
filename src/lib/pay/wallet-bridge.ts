"use client";

import { createContext, useContext } from "react";
import type { LiveWalletContext } from "@/lib/pay/live-provider";

export type WalletBridge = LiveWalletContext & {
  /** Opens the wallet connection modal. No-op when wallet login is disabled. */
  open: () => void;
};

/**
 * Neutral wallet-state bridge. The Reown shell populates this context with
 * the connected external wallet's EIP-1193 provider and account facts. The
 * rest of the app reads from here so no wallet library leaks into the
 * PaymentProvider boundary.
 */
export const WalletBridgeContext = createContext<WalletBridge>({
  provider: null,
  address: null,
  chainId: null,
  ready: false,
  open: () => undefined,
});

export function useWalletBridge(): WalletBridge {
  return useContext(WalletBridgeContext);
}