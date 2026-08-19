"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { HelpTip } from "@/components/help-tip";
import { StatusBadge } from "@/components/status-badge";
import { Label } from "@/components/ui/label";
import { PAY_NETWORK_LIST, type PayNetworkKey } from "@/lib/pay/networks";
import { setPayNetworkAction } from "@/lib/rent-advance/actions";

export function PayNetworkControl({
  networkKey,
  networkLabel,
  isTestnet,
  allowMainnet,
}: {
  networkKey: string;
  networkLabel: string;
  isTestnet: boolean;
  allowMainnet: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const selected = PAY_NETWORK_LIST.some((network) => network.key === networkKey)
    ? networkKey
    : PAY_NETWORK_LIST[0].key;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="flex items-center gap-2 font-medium">
          Payment network
          <HelpTip label="Payment network">
            Luis uses this when he connects a real wallet. Use a test network.
            Mainnet stays off until we turn it on for real USDC.
          </HelpTip>
          <StatusBadge tone={isTestnet ? "info" : "warning"}>
            {isTestnet ? "Test" : "Mainnet"}
          </StatusBadge>
        </p>
        <p className="text-sm text-muted-foreground">
          Pay will show {networkLabel}. The demo wallet still does not send
          real money.
        </p>
      </div>
      <div className="space-y-1.5 sm:min-w-56">
        <Label htmlFor="pay-network">Selected network</Label>
        <select
          id="pay-network"
          className="min-h-11 min-w-56 rounded-xl border bg-background px-3 text-sm"
          value={selected}
          disabled={pending}
          onChange={(event) => {
            const value = event.target.value as PayNetworkKey;
            startTransition(async () => {
              try {
                setError(null);
                await setPayNetworkAction(value);
                router.refresh();
              } catch {
                setError("The payment network could not be updated. Try again.");
              }
            });
          }}
        >
          <optgroup label="Use now">
            {PAY_NETWORK_LIST.filter((network) => network.isTestnet).map((network) => (
              <option key={network.key} value={network.key}>
                {network.networkLabel}
              </option>
            ))}
          </optgroup>
          {allowMainnet ? (
            <optgroup label="Later · real USDC">
              {PAY_NETWORK_LIST.filter((network) => !network.isTestnet).map((network) => (
                <option key={network.key} value={network.key}>
                  {network.networkLabel}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <div aria-live="polite">
          {pending ? (
            <p className="text-xs text-muted-foreground">Updating…</p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
