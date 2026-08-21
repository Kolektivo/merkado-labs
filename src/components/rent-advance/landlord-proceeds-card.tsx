"use client";

import { CheckCircle2, Clock3, LockKeyhole } from "lucide-react";

import { ClaimProceedsForm } from "@/components/rent-advance/claim-proceeds-form";
import { HelpTip } from "@/components/help-tip";
import { Money } from "@/components/money-display";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { truncateHash } from "@/lib/rent-advance/ids";
import { cn } from "@/lib/utils";

export type LandlordProceedsUiStatus =
  | "waiting"
  | "available"
  | "processing"
  | "failed"
  | "paid";

const STATUS_LABEL: Record<LandlordProceedsUiStatus, string> = {
  waiting: "Waiting",
  available: "Available",
  processing: "Processing",
  failed: "Failed",
  paid: "Paid",
};

const STATUS_TONE: Record<LandlordProceedsUiStatus, StatusTone> = {
  waiting: "warning",
  available: "success",
  processing: "info",
  failed: "error",
  paid: "neutral",
};

function LockedAddress({ address }: { address: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
      <LockKeyhole className="text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-sm font-medium">
          Demo address locked
          <HelpTip label="Locked payout address">
            It cannot be changed after claiming.
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
  reference,
  propertyName,
  status,
  purchasePriceCents,
  feeCents,
  amountCents,
  lockedAddress,
  savedAddress,
  successHref,
}: {
  reference: string;
  propertyName: string;
  status: LandlordProceedsUiStatus;
  purchasePriceCents: number;
  feeCents: number;
  amountCents: number;
  lockedAddress?: string | null;
  savedAddress?: string | null;
  successHref?: string;
}) {
  const funded = status !== "waiting";

  return (
    <Card
      className={cn(
        status === "available" && "ring-primary/35 shadow-md",
      )}
    >
      <CardHeader
        className={cn(
          "border-b pb-4",
          status === "available" && "bg-primary/5",
        )}
      >
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          Sale amount for the landlord
          <HelpTip label="Landlord sale amount">
            This is the one-time amount from selling the offer. Monthly rent
            later belongs to the holder.
          </HelpTip>
        </p>
        <CardTitle className="text-lg">{propertyName}</CardTitle>
        <CardAction>
          <StatusBadge tone={STATUS_TONE[status]}>
            {STATUS_LABEL[status]}
          </StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === "waiting" ? (
          <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
            <Clock3 className="mt-0.5 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">Wait for the full purchase</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Then <Money cents={purchasePriceCents} /> will be ready to claim.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <CheckCircle2 className="text-primary" aria-hidden />
                {status === "paid"
                  ? "Paid"
                  : status === "available"
                    ? "Ready to claim"
                    : status === "failed"
                      ? "Claim failed"
                      : "Claim in progress"}
                <HelpTip label="Offer fully bought">
                  The demo has recorded the full purchase of this offer.
                </HelpTip>
              </p>
              <p
                className={cn(
                  "mt-1 text-3xl font-semibold tracking-tight",
                  status === "available" && "text-primary",
                )}
              >
                <Money cents={amountCents} />
              </p>
            </div>
            {feeCents > 0 ? (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                Fee already included
                <HelpTip label="Included fee">
                  Merkado’s fee is <Money cents={feeCents} />. It will not be
                  deducted again.
                </HelpTip>
              </p>
            ) : null}
          </>
        )}

        {status === "available" ? (
          <ClaimProceedsForm
            reference={reference}
            amountCents={amountCents}
            savedAddress={savedAddress ?? null}
            successHref={successHref}
          />
        ) : null}

        {status === "processing" && lockedAddress ? (
          <LockedAddress address={lockedAddress} />
        ) : null}

        {status === "failed" && lockedAddress ? (
          <>
            <p className="text-sm text-muted-foreground">
              The demo payout failed. Retry with the same locked address.
            </p>
            <LockedAddress address={lockedAddress} />
          </>
        ) : null}

        {status === "paid" && lockedAddress ? (
          <LockedAddress address={lockedAddress} />
        ) : null}

        {funded ? (
          <Alert className="py-2">
            <AlertDescription>
              Demo only — no wallet check or transfer.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
