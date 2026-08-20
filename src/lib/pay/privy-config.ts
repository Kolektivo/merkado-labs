import type { PrivyClientConfig } from "@privy-io/react-auth";

export function privyAppId(): string {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
}

/** External wallets only. No embedded wallets for this MVP. */
export function privyClientConfig(): PrivyClientConfig {
  return {
    externalWallets: {
      walletConnect: { enabled: true },
      // Embedded wallets are intentionally not enabled.
    },
  };
}
