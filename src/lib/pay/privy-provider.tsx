"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { privyAppId, privyClientConfig } from "@/lib/pay/privy-config";

/**
 * Wraps the Pay surface in Privy so external wallet connection works.
 * Uses the public App ID from `NEXT_PUBLIC_PRIVY_APP_ID`.
 */
export function PrivyShell({ children }: { children: React.ReactNode }) {
  const appId = privyAppId();
  return (
    <PrivyProvider appId={appId} config={privyClientConfig()}>
      {children}
    </PrivyProvider>
  );
}
