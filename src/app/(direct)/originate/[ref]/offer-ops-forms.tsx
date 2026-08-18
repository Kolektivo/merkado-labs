"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { HelpTip } from "@/components/help-tip";
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
  releaseCollectionAction,
  setOfferStatusAction,
} from "@/lib/rent-advance/actions";
import { canRecordCollection, statusLabel } from "@/lib/rent-advance/helpers";
import type { Actor, Collection, OfferStatus } from "@/lib/rent-advance/types";

const STATUSES: OfferStatus[] = [
  "draft",
  "under_review",
  "funding",
  "live",
  "collecting",
  "closed",
  "default",
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

export function OfferOpsForms({
  reference,
  status,
  nextReceivableN,
  actors,
}: {
  reference: string;
  status: OfferStatus;
  nextReceivableN: number | null;
  actors: Actor[];
}) {
  const { pending, error, run } = useOfferAction();
  const approvers = actors.filter((actor) => actor.role === "independent_approver");
  const [approverId, setApproverId] = useState(approvers[0]?.id ?? "");
  const [nextStatus, setNextStatus] = useState<OfferStatus>(status);
  const collecting = canRecordCollection(status);

  return (
    <div className="space-y-4">
      <FormError message={error} />

      {status === "under_review" ? (
        <Card>
          <CardHeader>
            <CardTitle>Credit approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              An independent approver must sign before this offer can be
              funded. R. Girigoria is selected for the walkthrough.
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
                      {actor.name} · {actor.title}
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

      {collecting ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Collections
              <HelpTip label="Collections">
                Record that this month’s rent arrived. Only live, collecting,
                or defaulted offers can do this.
              </HelpTip>
            </CardTitle>
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
          </CardContent>
        </Card>
      ) : status === "under_review" ? null : (
        <p className="text-sm text-muted-foreground">
          Collections start after this offer is live.
        </p>
      )}

      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Lab controls
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-2">
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
      </details>
    </div>
  );
}

export function DualControlForm({
  reference,
  releasableCollections,
  actors,
}: {
  reference: string;
  releasableCollections: Collection[];
  actors: Actor[];
}) {
  const { pending, error, run } = useOfferAction();
  const [collectionId, setCollectionId] = useState(
    releasableCollections[0]?.id ?? "",
  );
  const officers = actors.filter((actor) =>
    ["operations", "independent_approver", "foundation_signatory"].includes(
      actor.role,
    ),
  );
  const [instructorId, setInstructorId] = useState("act-martina");
  const [signatoryId, setSignatoryId] = useState("act-sambo");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Dual-control release
          <HelpTip label="Dual-control release">
            Two different people must approve before collected rent is
            released. Same person twice is rejected.
          </HelpTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <FormError message={error} />
        <p className="text-sm text-muted-foreground">
          Two different people must approve. Same person twice is rejected.
          Walkthrough defaults: D. Martina instructs, A. Sambo signs.
        </p>
        {releasableCollections.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="release-collection">Collection</Label>
                <Select value={collectionId} onValueChange={setCollectionId}>
                  <SelectTrigger id="release-collection" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {releasableCollections.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        Month {row.receivableN} · {row.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="instructor">Instructor</Label>
                <Select value={instructorId} onValueChange={setInstructorId}>
                  <SelectTrigger id="instructor" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {officers.map((actor) => (
                      <SelectItem key={actor.id} value={actor.id}>
                        {actor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signatory">Signatory</Label>
                <Select value={signatoryId} onValueChange={setSignatoryId}>
                  <SelectTrigger id="signatory" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {officers.map((actor) => (
                      <SelectItem key={actor.id} value={actor.id}>
                        {actor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="button"
              disabled={pending || !collectionId}
              onClick={() =>
                run(() =>
                  releaseCollectionAction({
                    reference,
                    collectionId,
                    instructorId,
                    signatoryId,
                  }),
                )
              }
            >
              Release this month’s rent
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No collection is waiting for release.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
