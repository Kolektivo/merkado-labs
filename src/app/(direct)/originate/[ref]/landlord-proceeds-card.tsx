"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { HelpTip } from "@/components/help-tip";
import { Money } from "@/components/money-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  completeLandlordProceedsClaimAction,
  failLandlordProceedsClaimAction,
  startLandlordProceedsClaimAction,
} from "@/lib/rent-advance/actions";
import { truncateHash } from "@/lib/rent-advance/ids";
import type { LandlordProceedsClaim } from "@/lib/rent-advance/types";
import { formatDate } from "@/lib/format";

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>Could not complete</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function useOfferAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "The action failed.");
      }
    });
  }

  return { pending, error, run };
}

const MOCK_DISCLOSURE =
  "Mock demo — no wallet ownership was verified and no on-chain transfer was sent.";

export function LandlordProceedsCard({
  reference,
  claim,
  purchasePriceCents,
  feeCents,
}: {
  reference: string;
  claim: LandlordProceedsClaim | null;
  purchasePriceCents: number;
  feeCents: number;
}) {
  const { pending, error, run } = useOfferAction();
  const [destination, setDestination] = useState("");

  if (!claim) {
    return (
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm text-muted-foreground">
            Landlord proceeds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Waiting for funding. Proceeds become available after the offer is
            fully purchased.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          Landlord proceeds
          <HelpTip label="Landlord proceeds">
            A mock sale-proceeds claim for this fully funded offer. The payout
            address is an unverified demo address, not proof of wallet
            ownership.
          </HelpTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <FormError message={error} />
        <div className="space-y-2">
          <p className="font-medium">
            <Money cents={purchasePriceCents} /> purchase price
          </p>
          <p className="text-sm text-muted-foreground">
            Existing fee <Money cents={feeCents} /> already accounted for
          </p>
          <p className="font-medium">
            <Money cents={claim.claimableCents} /> available to claim
          </p>
        </div>

        {claim.status === "available" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`eoa-${reference}`}>
                Demo payout address (unverified)
              </Label>
              <Input
                id={`eoa-${reference}`}
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="0x…"
              />
            </div>
            <Button
              type="button"
              disabled={pending || !destination.trim()}
              onClick={() =>
                run(() =>
                  startLandlordProceedsClaimAction(reference, destination.trim()),
                )
              }
            >
              Claim proceeds
            </Button>
          </>
        ) : null}

        {claim.status === "processing" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Mock payout processing to{" "}
              <code className="font-mono">
                {truncateHash(claim.destinationEoa ?? "")}
              </code>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={pending}
                onClick={() => run(() => completeLandlordProceedsClaimAction(reference))}
              >
                Mark as paid
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => failLandlordProceedsClaimAction(reference))}
              >
                Mark as failed
              </Button>
            </div>
          </>
        ) : null}

        {claim.status === "failed" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Mock payout failed. You can retry to the same locked destination{" "}
              <code className="font-mono">
                {truncateHash(claim.destinationEoa ?? "")}
              </code>
              .
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !claim.destinationEoa}
              onClick={() =>
                run(() =>
                  startLandlordProceedsClaimAction(reference, claim.destinationEoa ?? ""),
                )
              }
            >
              Retry claim
            </Button>
          </>
        ) : null}

        {claim.status === "paid" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Paid to{" "}
              <code className="font-mono">
                {truncateHash(claim.destinationEoa ?? "")}
              </code>{" "}
              on {claim.paidAt ? formatDate(claim.paidAt) : "—"}
            </p>
            <p className="text-sm text-muted-foreground">{MOCK_DISCLOSURE}</p>
          </>
        ) : null}

        {claim.status === "available" ? (
          <p className="text-sm text-muted-foreground">{MOCK_DISCLOSURE}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
