"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useWalletIdentity } from "@/hooks/use-wallet-identity";

/** Keep client-side wallet disconnects aligned with the server session gate. */
export function WalletSessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const onSessionInvalidated = useCallback(() => {
    if (window.location.pathname === "/enter") return;
    const next = `${window.location.pathname}${window.location.search}`;
    router.replace(`/enter?next=${encodeURIComponent(next)}`);
  }, [router]);

  useWalletIdentity(onSessionInvalidated, pathname);
  return null;
}
