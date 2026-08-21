"use client";

import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { truncateHash } from "@/lib/rent-advance/ids";
import { cn } from "@/lib/utils";

export const DEMO_HOLDER_WALLET = "0xDEMOHOLDERWALLET0001";

export function MockWalletConnection({
  connected,
  onConnect,
  width = "page",
}: {
  connected: boolean;
  onConnect: () => void;
  width?: "fill" | "page";
}) {
  const fill = width === "fill";

  if (connected) {
    return (
      <div
        className={cn(
          "flex flex-col gap-2",
          fill ? "items-stretch" : "items-stretch md:items-start",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5",
            fill ? "w-full" : "w-full md:w-auto",
          )}
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-sky-400 text-[11px] font-semibold text-white"
            aria-hidden
          >
            0x
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Connected</p>
            <p className="font-mono text-xs text-muted-foreground">
              {truncateHash(DEMO_HOLDER_WALLET)}
            </p>
          </div>
          <span className="size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Demo only — ownership is not verified.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        fill ? "items-stretch" : "items-stretch md:items-start",
      )}
    >
      <Button
        type="button"
        className={cn("min-h-11 px-4", fill ? "w-full" : "w-full md:w-auto")}
        aria-label="Connect wallet"
        onClick={onConnect}
      >
        <Wallet data-icon="inline-start" />
        Connect wallet
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Demo only — no real wallet opens.
      </p>
    </div>
  );
}
