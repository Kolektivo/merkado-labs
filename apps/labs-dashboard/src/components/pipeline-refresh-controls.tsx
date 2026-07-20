"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { SourceOperationsCard } from "@/lib/data/operations";
import { formatUsd } from "@/lib/enrichment/cost";
import { formatDateTime, formatNumber } from "@/lib/format";

type ConfirmState =
  | null
  | {
      mode: "single_source" | "run_all_ready";
      sourceKeys: string[];
      cards: SourceOperationsCard[];
    };

function readinessTone(readiness: string): StatusTone {
  if (readiness === "Ready") return "success";
  if (readiness === "Running" || readiness === "Queued") return "info";
  if (readiness === "Partial") return "warning";
  if (readiness === "Blocked" || readiness === "Failed") return "error";
  return "neutral";
}

export function PipelineRefreshControls({
  cards,
}: {
  cards: SourceOperationsCard[];
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const readyCards = cards.filter(
    (card) => card.readiness === "ready" && card.allowsFullRefresh,
  );

  async function enqueue() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/pipeline/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          triggerMode: confirm.mode,
          sourceKeys: confirm.sourceKeys,
          expectedAiListingCount: 0,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        workerHint?: string;
        run?: { id: string; message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "The refresh could not be queued.");
      }
      setMessage(
        payload.run?.message ??
          payload.workerHint ??
          "Queued — waiting for the local worker",
      );
      setConfirm(null);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The refresh could not be queued.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Ready sources can be refreshed manually. Incomplete and blocked sources
          remain read-only.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={readyCards.length === 0}
          onClick={() =>
            setConfirm({
              mode: "run_all_ready",
              sourceKeys: readyCards.map((card) => card.sourceKey),
              cards: readyCards,
            })
          }
        >
          Refresh all ready sources
        </Button>
      </div>

      <div className="divide-y rounded-xl border bg-card">
        {cards.map((card) => {
          const canRefresh = card.primaryAction === "Refresh & enrich";
          return (
            <div
              key={card.sourceKey}
              className="grid min-w-0 gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:p-5"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="truncate font-medium">{card.displayName}</h3>
                  <StatusBadge tone={readinessTone(card.uiReadiness)}>
                    {card.uiReadiness}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatNumber(card.listingCount)} listings ·{" "}
                  {formatNumber(card.publicCount)} public-ready
                  {card.latestSuccessfulRefresh
                    ? ` · refreshed ${formatDateTime(card.latestSuccessfulRefresh)}`
                    : " · no successful refresh yet"}
                </p>
                {card.currentIssue ? (
                  <p className="mt-2 text-sm">
                    <span className="font-medium">Issue:</span>{" "}
                    <span className="text-muted-foreground">
                      {card.currentIssue}
                    </span>
                  </p>
                ) : null}
                {card.activeRunStatus ? (
                  <p className="mt-2 text-sm font-medium">
                    {card.activeRunStatus === "queued"
                      ? "Queued — waiting for worker"
                      : `Running${
                          card.activeStage ? ` · ${card.activeStage}` : ""
                        }`}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant={canRefresh ? "default" : "outline"}
                disabled={!canRefresh}
                onClick={() =>
                  canRefresh
                    ? setConfirm({
                        mode: "single_source",
                        sourceKeys: [card.sourceKey],
                        cards: [card],
                      })
                    : undefined
                }
              >
                {canRefresh ? (
                  <>
                    <RefreshCw data-icon="inline-start" />
                    Refresh & enrich
                  </>
                ) : card.primaryAction === "Continue setup" ? (
                  "Setup incomplete"
                ) : (
                  "Refresh unavailable"
                )}
              </Button>
            </div>
          );
        })}
      </div>

      <Sheet
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-[min(94vw,520px)] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Confirm source refresh</SheetTitle>
            <SheetDescription>
              Review what will happen before the run is added to the queue.
            </SheetDescription>
          </SheetHeader>
          {confirm ? (
            <div className="flex flex-col gap-5 px-4 text-sm">
              <section>
                <h3 className="font-medium">Source refresh</h3>
                <p className="mt-1 text-muted-foreground">
                  {confirm.cards.map((card) => card.displayName).join(", ")} will
                  be checked, validated, and saved. Nothing runs until the local
                  worker claims the queued request.
                </p>
              </section>
              <section>
                <h3 className="font-medium">Changed-listing enrichment</h3>
                <p className="mt-1 text-muted-foreground">
                  AI runs only for new or meaningfully changed listings. Unchanged
                  successful listings are skipped at no AI cost.
                </p>
              </section>
              <section>
                <h3 className="font-medium">Initial AI backfill</h3>
                <p className="mt-1 text-muted-foreground">
                  Not included. Enriching listings that have never been processed
                  requires a separate approval and cost limit.
                </p>
              </section>
              <section>
                <h3 className="font-medium">Estimated cost and safety</h3>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  <li>Hard AI ceiling: {formatUsd(0.75)}</li>
                  <li>Actual cost is estimated from recorded token use.</li>
                  <li>
                    Missing/removed status changes only follow a complete,
                    successful catalog.
                  </li>
                </ul>
              </section>
              <details className="rounded-lg bg-muted/40 p-3">
                <summary className="cursor-pointer font-medium">
                  Technical details
                </summary>
                <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                  <p>
                    Mode:{" "}
                    {confirm.mode === "run_all_ready"
                      ? "all ready sources"
                      : "single source"}
                  </p>
                  <p>
                    Current catalog size:{" "}
                    {formatNumber(
                      confirm.cards.reduce(
                        (sum, card) => sum + card.listingCount,
                        0,
                      ),
                    )}
                  </p>
                  <p>
                    Stages: source check, fetch, validation, save, location, AI,
                    final checks.
                  </p>
                </div>
              </details>
            </div>
          ) : null}
          <SheetFooter className="border-t">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void enqueue()}
            >
              {busy ? "Adding to queue…" : "Queue refresh"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Keep current data
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <div aria-live="polite" role="status">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}
