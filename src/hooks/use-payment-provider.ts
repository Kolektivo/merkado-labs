"use client";

import { useMemo } from "react";

import { createMockPaymentProvider } from "@/lib/pay/mock-provider";
import { createLivePaymentProvider } from "@/lib/pay/live-provider";
import { PAYMENT_RAIL_MODE } from "@/lib/pay/mode";
import type { PaymentProvider } from "@/lib/pay/provider";
import { useWalletBridge } from "@/lib/pay/wallet-bridge";
import type { CryptoConfig } from "@/lib/rent-advance/types";

/**
 * Returns the active payment provider. In mock mode it returns the demo
 * provider; in live mode it returns a Reown/AppKit + viem provider. The
 * hook itself stays agnostic of the wallet library: it reads the neutral
 * `WalletBridge` context.
 */
export function usePaymentProvider(
  config: CryptoConfig | null | undefined,
): PaymentProvider {
  const bridge = useWalletBridge();

  return useMemo(() => {
    if (PAYMENT_RAIL_MODE === "live") {
      return createLivePaymentProvider(config, () => ({
        provider: bridge.provider,
        address: bridge.address,
        chainId: bridge.chainId,
        ready: bridge.ready,
      }));
    }
    return createMockPaymentProvider({ config });
  }, [config, bridge]);
}
