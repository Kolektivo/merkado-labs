"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { HelpTip } from "@/components/help-tip";
import { MockWalletConnection } from "@/components/mock-wallet-connection";
import { Money } from "@/components/money-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { collectRentFromNftAction } from "@/lib/rent-advance/actions";
import { formatXcg } from "@/lib/rent-advance/money";

export function ClaimRentForm({
  reference,
  amountCents,
  distributionId,
}: {
  reference: string;
  amountCents: number;
  distributionId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not claim</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-center justify-between gap-4 rounded-xl bg-primary/5 p-4">
        <div>
          <p className="text-sm text-muted-foreground">Rent ready</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-primary">
            <Money cents={amountCents} />
          </p>
        </div>
        <HelpTip label="claiming rent">
          This is monthly rent that the renter paid. It belongs to the holder,
          not the landlord.
        </HelpTip>
      </div>
      <MockWalletConnection
        connected={connected}
        onConnect={() => setConnected(true)}
      />
      {connected ? (
        <Button
          type="button"
          className="min-h-11 px-4"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await collectRentFromNftAction(reference, distributionId);
                try {
                  window.sessionStorage.setItem(
                    `merkado:success:rent:${reference}`,
                    formatXcg(amountCents),
                  );
                } catch {
                  // The claim succeeded; the amount is optional dialog detail.
                }
                router.push(`/portfolio/${reference}?success=rent`);
              } catch (err) {
                setError(err instanceof Error ? err.message : "The claim failed.");
              }
            });
          }}
        >
          Claim rent
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Demo only — no money is transferred.
      </p>

    </div>
  );
}
