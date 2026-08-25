"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";
import { ensureBaseSepolia } from "@/lib/pay/wallet-adapter";
import { truncateHash } from "@/lib/rent-advance/ids";
import { BASE_SEPOLIA_CHAIN_ID, BASE_SEPOLIA_NETWORK_LABEL } from "@/lib/pay/networks";
import { cn } from "@/lib/utils";

/**
 * Wallet connect/disconnect surface. When Reown AppKit is configured it uses
 * the Reown modal and its polished connect button; otherwise it falls back to
 * the injected-wallet button.
 */
export function WalletConnection({
  className,
  variant = "default",
  compact = false,
  onConnectedChange,
}: {
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  compact?: boolean;
  onConnectedChange?: (connected: boolean) => void;
}) {
  const wallet = useMerkadoWallet();
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    onConnectedChange?.(wallet.isConnected);
  }, [wallet.isConnected, onConnectedChange]);

  const onBaseSepolia = wallet.chainId === BASE_SEPOLIA_CHAIN_ID;

  const handleSwitch = async () => {
    setError(null);
    setSwitching(true);
    try {
      await ensureBaseSepolia(wallet, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch network.");
    } finally {
      setSwitching(false);
    }
  };

  const shortAddress = wallet.address ? truncateHash(wallet.address) : "wallet";
  const statusText = wallet.isConnected
    ? `Connected to ${shortAddress}${
        onBaseSepolia ? ` on ${BASE_SEPOLIA_NETWORK_LABEL}` : " on another network"
      }`
    : wallet.connecting
      ? "Opening wallet…"
      : "Wallet not connected";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          "flex items-center gap-3 rounded-xl border bg-card px-3",
          compact ? "py-1.5 text-xs" : "py-2.5 text-sm",
        )}
      >
        {wallet.isConnected ? (
          <>
            <span
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white"
              aria-hidden
            >
              0x
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5 font-medium">
                Connected
                <span
                  className="inline-block size-2 rounded-full bg-emerald-500"
                  aria-hidden
                />
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {shortAddress}
              </span>
            </span>
          </>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
                "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              <X className="size-3" />
            </span>
            <span className="min-w-0 flex-1 font-medium">{statusText}</span>
          </>
        )}
        {wallet.isConnected && !onBaseSepolia ? (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            Wrong network
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-destructive" aria-live="polite">
          {error}
        </p>
      ) : null}

      {!wallet.isConnected ? (
        <Button
          type="button"
          variant={variant}
          className={cn("min-h-11 px-4", compact && "min-h-9")}
          disabled={wallet.connecting}
          onClick={() => void wallet.connect()}
        >
          {wallet.connecting ? "Opening…" : "Connect wallet"}
        </Button>
      ) : (
        <div className={cn("flex flex-wrap gap-2", compact && "gap-1.5")}>
          {!onBaseSepolia ? (
            <Button
              type="button"
              variant={variant}
              className={cn("min-h-11 px-4", compact && "min-h-9")}
              disabled={switching}
              onClick={handleSwitch}
            >
              {switching ? "Switching…" : `Switch to ${BASE_SEPOLIA_NETWORK_LABEL}`}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className={cn("min-h-11 px-4", compact && "min-h-9")}
            onClick={() => wallet.disconnect()}
          >
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}
