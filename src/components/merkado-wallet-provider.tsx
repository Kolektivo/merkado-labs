"use client";

import type { ReactNode } from "react";

import { useWalletState } from "@/hooks/use-merkado-wallet";
import { MerkadoWalletContext } from "@/lib/pay/wallet-context";

/**
 * Single wallet state for the whole app. Mount once so Account, Direct,
 * Marketplace, and Portfolio share one connection instead of each surface
 * creating its own injected-wallet listeners and momentarily appearing
 * disconnected after navigation.
 */
export function MerkadoWalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletState();
  return (
    <MerkadoWalletContext.Provider value={wallet}>
      {children}
    </MerkadoWalletContext.Provider>
  );
}