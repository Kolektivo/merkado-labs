"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  LogOut,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";
import { ensureBaseSepolia } from "@/lib/pay/wallet-adapter";
import { truncateHash } from "@/lib/rent-advance/ids";
import { BASE_SEPOLIA_CHAIN_ID, BASE_SEPOLIA_NETWORK_LABEL } from "@/lib/pay/networks";
import { cn } from "@/lib/utils";

const EXPLORER_BASE_URL = "https://sepolia.basescan.org";

/**
 * Wallet connect/disconnect surface. When Reown AppKit is configured it uses
 * the Reown modal and its polished connect button; otherwise it falls back to
 * the injected-wallet button. Once connected, the wallet pill opens a small
 * menu with the address, network, explorer link, and disconnect — no ugly
 * inline disconnect button.
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
  const [copied, setCopied] = useState(false);

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

  const copyAddress = async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable; the full address stays visible in the menu.
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
      {wallet.isConnected ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={statusText}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border bg-card px-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                compact ? "py-1.5 text-xs" : "py-2.5 text-sm",
              )}
            >
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
              <ChevronsUpDown
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <div className="space-y-1.5">
              <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Connected wallet
              </p>
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
                <span className="min-w-0 truncate" title={wallet.address ?? undefined}>
                  {wallet.address}
                </span>
                <button
                  type="button"
                  onClick={() => void copyAddress()}
                  aria-label="Copy address"
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {copied ? (
                    <Check className="size-4 text-emerald-500" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 px-1 py-1 text-xs text-muted-foreground">
                <span>Network</span>
                {onBaseSepolia ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                    <Check className="size-3.5" aria-hidden />
                    {BASE_SEPOLIA_NETWORK_LABEL}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold uppercase tracking-wide text-amber-700">
                    Wrong network
                  </span>
                )}
              </div>
            </div>

            {!onBaseSepolia ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                disabled={switching}
                onClick={() => void handleSwitch()}
              >
                {switching ? "Switching…" : `Switch to ${BASE_SEPOLIA_NETWORK_LABEL}`}
              </Button>
            ) : null}

            {wallet.address ? (
              <Button type="button" variant="outline" size="sm" className="w-full justify-start" asChild>
                <a
                  href={`${EXPLORER_BASE_URL}/address/${wallet.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  View on explorer
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
            ) : null}

            <Separator />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => wallet.disconnect()}
            >
              <LogOut className="size-4" aria-hidden />
              Disconnect
            </Button>
          </PopoverContent>
        </Popover>
      ) : (
        <div
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "flex items-center gap-3 rounded-xl border bg-card px-3",
            compact ? "py-1.5 text-xs" : "py-2.5 text-sm",
          )}
        >
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
        </div>
      )}

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
      ) : null}
    </div>
  );
}