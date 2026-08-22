"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  approveOfferAction,
  recordCollectionAction,
  setOfferStatusAction,
  submitOfferForReviewAction,
} from "@/lib/rent-advance/actions";
import { canRecordCollection, statusLabel } from "@/lib/rent-advance/helpers";
import type { Actor, OfferStatus } from "@/lib/rent-advance/types";

const STATUSES: OfferStatus[] = [
  "draft",
  "under_review",
  "denied",
  "funding",
  "live",
  "collecting",
  "closed",
  "default",
  "expired",
];

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

export function OfferCustomerActions({
  reference,
  status,
}: {
  reference: string;
  status: OfferStatus;
}) {
  const { pending, error, run } = useOfferAction();

  if (status === "draft") {
    return (
      <div className="space-y-3">
        <FormError message={error} />
        <Card className="bg-primary/5 ring-primary/20">
          <CardHeader>
            <CardTitle>Submit request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Send this offer to Admin for approval. No wallet is needed.
            </p>
            <Button
              type="button"
              disabled={pending}
              onClick={() => run(() => submitOfferForReviewAction(reference))}
            >
              Submit request
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "under_review") {
    return (
      <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
        Waiting for Admin approval.
      </p>
    );
  }

  return null;
}

export function OfferAdminForms({
  reference,
  status,
  nextReceivableN,
  actors,
  onchainPurchased,
}: {
  reference: string;
  status: OfferStatus;
  nextReceivableN: number | null;
  actors: Actor[];
  onchainPurchased: boolean;
}) {
  const { pending, error, run } = useOfferAction();
  const approvers = actors.filter((actor) => actor.role === "independent_approver");
  const [approverId, setApproverId] = useState(approvers[0]?.id ?? "");
  const [nextStatus, setNextStatus] = useState<OfferStatus>(status);
  const collecting = canRecordCollection(status);

  return (
    <div className="space-y-4">
      <FormError message={error} />

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="offer-status">Set status</Label>
          <Select
            value={nextStatus}
            onValueChange={(value) => setNextStatus(value as OfferStatus)}
          >
            <SelectTrigger id="offer-status" className="min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {statusLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setOfferStatusAction(reference, nextStatus))}
        >
          Update status
        </Button>
      </div>

      {status === "under_review" ? (
        <Card>
          <CardHeader>
            <CardTitle>Independent approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Approval moves the offer to Mint pending. The company Safe mints
              one offer NFT per listing; the landlord never signs.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="approver">Approver</Label>
              <Select value={approverId} onValueChange={setApproverId}>
                <SelectTrigger id="approver" className="w-full min-w-56">
                  <SelectValue placeholder="Select independent approver" />
                </SelectTrigger>
                <SelectContent>
                  {approvers.map((actor) => (
                    <SelectItem key={actor.id} value={actor.id}>
                      {actor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              disabled={pending || !approverId}
              onClick={() => run(() => approveOfferAction(reference, approverId))}
            >
              Approve offer
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {collecting && !onchainPurchased ? (
        <Card>
          <CardHeader>
            <CardTitle>Record collection</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {nextReceivableN != null ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => recordCollectionAction(reference, nextReceivableN))
                }
              >
                Record collection · month {nextReceivableN}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                No scheduled receivable remains.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Ops fallback if a month arrived outside Merkado Pay. Live renter
              payments land on the offer contract and are verified from the
              chain.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}