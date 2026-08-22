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

type ProceedsUiState = "waiting" | "minted" | "paid";

function stateFor(presentation: ProceedsPresentation): ProceedsUiState {
  if (presentation.landlordPaid) return "paid";
  if (presentation.minted) return "minted";
  return "waiting";
}

const STATUS_LABEL: Record<ProceedsUiState, string> = {
  waiting: "Mint pending",
  minted: "Minted",
  paid: "Paid",
};

function LockedAddress({ address }: { address: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
      <LockKeyhole className="text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-sm font-medium">
          Payout address locked at mint
          <HelpTip label="Locked payout address">
            The backend locks this address when it mints the offer NFT. The
            buyer pays the sale amount here. It is never shown on payer or
            purchaser screens.
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
            offer NFT is purchased. Monthly rent later belongs to the NFT owner.
          </HelpTip>
        </p>
        <CardTitle className="text-lg">{propertyName}</CardTitle>
        <StatusBadge tone={state === "paid" ? "success" : state === "minted" ? "info" : "warning"}>
          {STATUS_LABEL[state]}
        </StatusBadge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state === "waiting" ? (
          <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
            <Clock3 className="mt-0.5 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">Wait for the Safe mint and full purchase</p>
              <p className="mt-1 text-sm text-muted-foreground">
                After the offer NFT is minted, the buyer can
                purchase the whole offer. The buyer pays{" "}
                <Money cents={presentation.purchasePriceCents} /> to the payout
                address locked at mint.
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
                  : "Minted · awaiting purchase"}
                <HelpTip label="Verified on chain">
                  {state === "paid"
                    ? "The OfferPurchased receipt was verified on Base Sepolia."
                    : "The OfferMinted receipt was verified on Base Sepolia."}
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
              Add a Base Sepolia payout address before the mint. It is locked
              when the offer NFT is minted.
            </AlertDescription>
          </Alert>
        )}

        {state === "paid" ? (
          <Alert className="py-2">
            <AlertDescription>
              Verified from the purchase receipt. The sale amount went to the
              payout address above.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}