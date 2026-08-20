"use client";

import { useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

import { createMockPaymentProvider } from "@/lib/pay/mock-provider";
import { createLivePaymentProvider, type LiveWalletContext } from "@/lib/pay/live-provider";
import { PAYMENT_RAIL_MODE } from "@/lib/pay/mode";
import type { PaymentProvider } from "@/lib/pay/provider";
import type { CryptoConfig } from "@/lib/rent-advance/types";

/**
 * Returns the active payment provider. In mock mode it returns the demo
 * provider; in live mode it returns a Privy + viem provider.
 */
export function usePaymentProvider(
  config: CryptoConfig | null | undefined,
): PaymentProvider {
  const privy = usePrivy();
  const { wallets, ready } = useWallets();

  const getContext = useMemo<() => LiveWalletContext>(
    () => () => ({
      wallets,
      ready,
      authenticated: privy.authenticated,
    }),
    [wallets, ready, privy.authenticated],
  );

  return useMemo(() => {
    if (PAYMENT_RAIL_MODE === "live") {
      return createLivePaymentProvider(config, getContext);
    }
    return createMockPaymentProvider({ config });
  }, [config, getContext]);
}
