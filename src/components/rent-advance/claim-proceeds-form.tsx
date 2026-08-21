"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { HelpTip } from "@/components/help-tip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimLandlordProceedsAction } from "@/lib/rent-advance/actions";
import { formatXcg } from "@/lib/rent-advance/money";

export function ClaimProceedsForm({
  reference,
  amountCents,
  savedAddress,
  successHref,
}: {
  reference: string;
  amountCents: number;
  savedAddress: string | null;
  successHref?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [address, setAddress] = useState(savedAddress ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not claim</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor={`claim-address-${reference}`}>
            Demo payout address
          </Label>
          <HelpTip label="Demo payout address">
            This fictional address is not verified. It locks after you claim.
          </HelpTip>
        </div>
        <Input
          id={`claim-address-${reference}`}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0xDEMOLANDLORD001"
          autoComplete="off"
          spellCheck={false}
          className="min-h-10 font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Use a fictional address beginning with 0xDEMO.
          {savedAddress ? " Your saved demo address is prefilled." : ""}
        </p>
      </div>
      <Button
        type="button"
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !address.trim()}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await claimLandlordProceedsAction(reference, address);
              router.push(
                successHref ?? `/originate/${reference}?success=proceeds`,
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : "The claim failed.");
            }
          });
        }}
      >
        Claim {formatXcg(amountCents)}
      </Button>

    </div>
  );
}
