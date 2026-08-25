"use client";

import { CheckCircle2, Clock3, LockKeyhole } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { Money } from "@/components/money-display";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { truncateHash } from "@/lib/rent-advance/ids";
import type { ProceedsPresentation } from "@/lib/rent-advance/custody";

type ProceedsUiState = "waiting" | "processing" | "paid";

function stateFor(presentation: ProceedsPresentation): ProceedsUiState {
  if (presentation.landlordPaid) return "paid";
  if (presentation.processing) return "processing";
  return "waiting";
}

const STATUS_LABEL: Record<ProceedsUiState, string> = {
  waiting: "Waiting",
  processing: "Processing",
  paid: "Paid",
};

function LockedAddress({ address }: { address: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
      <LockKeyhole className="text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-sm font-medium">
          Locked payout address
          <HelpTip label="Locked payout address">
            The buyer pays the sale amount to this address. It is never shown
            on payer or purchaser screens.
          </HelpTip>
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {truncateHash(address)}
        </p>
      </div>
    </div>
  );
}

export function LandlordProceedsCard({
  propertyName,
  presentation,
}: {
  propertyName: string;
  presentation: ProceedsPresentation;
}) {
  const state = stateFor(presentation);

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          Sale amount for the landlord
          <HelpTip label="Landlord sale amount">
            The one-time amount the buyer pays to the payout address once the
            offer is bought. Monthly rent later belongs to the buyer.
          </HelpTip>
        </p>
        <CardTitle className="text-lg">{propertyName}</CardTitle>
        <StatusBadge tone={state === "paid" ? "success" : state === "processing" ? "info" : "warning"}>
          {STATUS_LABEL[state]}
        </StatusBadge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state === "waiting" ? (
          <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
            <Clock3 className="mt-0.5 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">Waiting for the offer to be bought</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Once the offer is bought, the buyer pays{" "}
                <Money cents={presentation.purchasePriceCents} /> directly to
                your locked payout address. You do not need to do anything.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <CheckCircle2 className="text-primary" aria-hidden />
                {state === "paid"
                  ? "Paid by the buyer"
                  : "Purchase in progress"}
                <HelpTip label="Sale payment">
                  {state === "paid"
                    ? "The sale payment was verified and paid to your payout address."
                    : "The buyer submitted the sale payment and it is being verified."}
                </HelpTip>
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                <Money cents={presentation.purchasePriceCents} />
              </p>
            </div>
            {presentation.feeCents > 0 ? (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                Fee already included
                <HelpTip label="Included fee">
                  Merkado’s fee is <Money cents={presentation.feeCents} />. It
                  will not be deducted again.
                </HelpTip>
              </p>
            ) : null}
          </>
        )}

        {presentation.payoutAddress ? (
          <LockedAddress address={presentation.payoutAddress} />
        ) : (
          <Alert className="py-2">
            <AlertDescription>
              Add a Base Sepolia payout address before you submit. It is locked
              for this offer.
            </AlertDescription>
          </Alert>
        )}

        {state === "paid" ? (
          <Alert className="py-2">
            <AlertDescription>
              Verified from the sale payment. The sale amount went to the
              payout address above.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}