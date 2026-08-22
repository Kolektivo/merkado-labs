import { createAppKit } from "@reown/appkit/react";
import { baseSepolia, type AppKitNetwork } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";

/**
 * Public Reown/AppKit project id (dashboard.reown.com). Public value, not a
 * secret. Empty = Reown wallet login disabled and the app falls back to the
 * injected-wallet path.
 */
export function reownProjectId(): string {
  return process.env.NEXT_PUBLIC_REOWN_PROJECT_ID?.trim() ?? "";
}

export function isReownConfigured(): boolean {
  return reownProjectId().length > 0;
}

const projectId = reownProjectId();
const configured = isReownConfigured();

/** Base Sepolia is the only wallet network in this demo. */
export const reownNetworks: [AppKitNetwork, ...AppKitNetwork[]] = [baseSepolia];

export const reownMetadata = {
  name: "Merkado Labs",
  description: "Merkado Direct · Merkado Pay (Base Sepolia demo)",
  url: "https://merkado-labs.vercel.app",
  icons: [],
};

export const reownWagmiAdapter = configured
  ? new WagmiAdapter({
      networks: reownNetworks,
      projectId,
      ssr: true,
    })
  : null;

/** AppKit modal singleton. External wallets only; email/social wallets disabled. */
export const appKit =
  configured && typeof window !== "undefined"
    ? createAppKit({
        adapters: [reownWagmiAdapter!],
        networks: reownNetworks,
        projectId,
        metadata: reownMetadata,
        features: {
          analytics: false,
          email: false,
          socials: [],
        },
        themeMode: "light",
      })
    : null;

/** Opens the AppKit wallet modal. No-op when Reown is not configured. */
export function openReownModal(): void {
  void appKit?.open();
}
