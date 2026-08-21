"use client";

import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { truncateHash } from "@/lib/rent-advance/ids";

export const DEMO_HOLDER_WALLET = "0xDEMOHOLDERWALLET0001";

export function MockWalletConnection({
  connected,
  onConnect,
}: {
  connected: boolean;
  onConnect: () => void;
}) {
  if (connected) {
    return (
      <div className="flex flex-col items-start gap-2">
        <div className="inline-flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
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
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        className="min-h-11 px-4"
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
