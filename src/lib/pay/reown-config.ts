import { createAppKit } from "@reown/appkit/react";
import { optimismSepolia, type AppKitNetwork } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";

/**
 * Public project ID from the Reown Dashboard (dashboard.reown.com).
 * This is a public value, not a secret. It must be set for external
 * wallet login to be enabled. Empty = wallet login stays disabled and
 * the demo runs on the mock rail.
 */
export function reownProjectId(): string {
  return process.env.NEXT_PUBLIC_REOWN_PROJECT_ID?.trim() ?? "";
}

/** True when a project ID is present, so the AppKit shell can mount. */
export function isReownConfigured(): boolean {
  return reownProjectId().length > 0;
}

const projectId = reownProjectId();
const configured = isReownConfigured();

/**
 * Live mode is OP Sepolia only in this MVP. Base Sepolia is a
 * demo-selectable fact for the mock walkthrough and is not
 * live-verifiable; mainnet stays off. Exposing only OP Sepolia in the
 * AppKit modal enforces that at the wallet-connection layer.
 */
export const reownNetworks: [AppKitNetwork, ...AppKitNetwork[]] = [optimismSepolia];

export const reownMetadata = {
  name: "Merkado Labs",
  description: "Merkado Pay rent payment demo (Labs)",
  url: "https://merkado-labs.vercel.app",
  icons: [],
};

/**
 * The wagmi adapter is used ONLY as AppKit's connection layer (external
 * wallets). viem remains the transfer and verification library. The
 * adapter is constructed with `ssr: true` so it is safe to build during
 * server rendering; it is only created when a project ID is configured.
 */
export const reownWagmiAdapter = configured
  ? new WagmiAdapter({
      networks: reownNetworks,
      projectId,
      ssr: true,
    })
  : null;

/**
 * AppKit modal singleton. Created only on the client and only when a
 * project ID is configured. External wallets only — embedded wallets
 * (email/social) are intentionally not enabled.
 */
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

/** Opens the AppKit wallet modal. No-op when AppKit is not configured. */
export function openReownModal(): void {
  void appKit?.open();
}