"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";
import { ensureBaseSepolia } from "@/lib/pay/wallet-adapter";
import { truncateHash } from "@/lib/rent-advance/ids";
import { BASE_SEPOLIA_CHAIN_ID, BASE_SEPOLIA_NETWORK_LABEL } from "@/lib/pay/networks";
import { isReownConfigured } from "@/lib/pay/reown-config";
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
  const reown = isReownConfigured();

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

  const statusText = wallet.isConnected
    ? `Connected to ${wallet.address ? truncateHash(wallet.address) : "wallet"}${
        onBaseSepolia ? ` on ${BASE_SEPOLIA_NETWORK_LABEL}` : ` on chain ${wallet.chainId ?? "unknown"}`
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
          "flex items-center gap-2 rounded-xl border bg-card px-3",
          compact ? "py-1.5 text-xs" : "py-2.5 text-sm",
        )}
      >
        <span
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
            wallet.isConnected ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          {wallet.isConnected ? <Check className="size-3" /> : <X className="size-3" />}
        </span>
        <span className="min-w-0 flex-1 font-medium">{statusText}</span>
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
        reown ? (
          <appkit-button
            label="Connect wallet"
            size={compact ? "sm" : "md"}
            balance="hide"
          />
        ) : (
          <Button
            type="button"
            variant={variant}
            className={cn("min-h-11 px-4", compact && "min-h-9")}
            disabled={wallet.connecting}
            onClick={() => void wallet.connect()}
          >
            {wallet.connecting ? "Opening…" : "Connect wallet"}
          </Button>
        )
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
