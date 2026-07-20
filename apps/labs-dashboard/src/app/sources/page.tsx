import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";

import { DataError } from "@/components/data-error";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSourceOperationsCards } from "@/lib/data/operations";
import { getPropertySources, getSourceRuns } from "@/lib/data/queries";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/lib/format";
import {
  runOutcomeLabel,
  runOutcomeTone,
} from "@/lib/ui-labels";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sources" };

function readinessTone(readiness: string): StatusTone {
  if (readiness === "Ready") return "success";
  if (readiness === "Running" || readiness === "Queued") return "info";
  if (readiness === "Partial") return "warning";
  if (readiness === "Failed" || readiness === "Blocked") return "error";
  return "neutral";
}

export default async function SourcesPage() {
  let cards;
  let registeredSources;
  let runs;
  try {
    [cards, registeredSources, runs] = await Promise.all([
      getSourceOperationsCards(),
      getPropertySources(),
      getSourceRuns(),
    ]);
  } catch (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Sources"
          description="Readiness and health for approved property websites."
          icon={Radio}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const registeredKeys = new Set(
    registeredSources.map((source) => source.sourceKey).filter(Boolean),
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Sources"
        description="See which property websites are ready, incomplete, or blocked — and what should happen next."
        icon={Radio}
        actions={
          <Button asChild>
            <Link href="/data-operations">
              Open Data Operations
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        }
      />

      <section aria-labelledby="source-status-heading">
        <div className="mb-3">
          <h2 id="source-status-heading" className="text-lg font-semibold">
            Source status
          </h2>
          <p className="text-sm text-muted-foreground">
            Successful, unchanged data is treated as complete. Exceptions stay
            visible.
          </p>
        </div>
        <Card className="gap-0 overflow-hidden py-0">
          <CardContent className="divide-y px-0">
            {cards.map((card) => {
              const hasDetail = registeredKeys.has(card.sourceKey);
              const content = (
                <>
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
                        ? ` · refreshed ${formatRelativeTime(card.latestSuccessfulRefresh)}`
                        : " · no successful refresh yet"}
                    </p>
                    {card.currentIssue ? (
                      <p className="mt-2 max-w-3xl text-sm">
                        <span className="font-medium">Current issue:</span>{" "}
                        <span className="text-muted-foreground">
                          {card.currentIssue}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No current issue.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                    <span className="text-xs font-medium text-muted-foreground">
                      {card.primaryAction}
                    </span>
                    {hasDetail ? <ArrowRight className="size-4" aria-hidden /> : null}
                  </div>
                </>
              );
              return hasDetail ? (
                <Link
                  key={card.sourceKey}
                  href={`/sources/${encodeURIComponent(card.sourceKey)}`}
                  className="grid gap-4 px-4 py-5 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-5"
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={card.sourceKey}
                  className="grid gap-4 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-5"
                >
                  {content}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="recent-source-runs-heading">
        <div className="mb-3">
          <h2 id="recent-source-runs-heading" className="text-lg font-semibold">
            Recent refreshes
          </h2>
          <p className="text-sm text-muted-foreground">
            Latest outcomes across registered sources.
          </p>
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="divide-y px-0">
            {runs.slice(0, 8).map((run) => (
              <div
                key={run.id}
                className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {cards.find((card) => card.sourceKey === run.sourceKey)
                      ?.displayName ?? run.sourceKey}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(run.startedAt)} ·{" "}
                    {formatNumber(run.discoveredCount)} found ·{" "}
                    {formatNumber(run.importedCount)} new ·{" "}
                    {formatNumber(run.updatedCount)} refreshed
                  </p>
                </div>
                <StatusBadge tone={runOutcomeTone(run.outcome)}>
                  {runOutcomeLabel(run.outcome)}
                </StatusBadge>
              </div>
            ))}
            {runs.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No source refreshes are recorded yet.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-medium">
          Technical details
        </summary>
        <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
          {cards.map((card) => (
            <div key={card.sourceKey} className="rounded-lg bg-muted/35 p-3">
              <p className="font-medium text-foreground">{card.displayName}</p>
              <p>Internal key: {card.sourceKey}</p>
              <p>Adapter: {card.adapterVersion}</p>
              <p>Catalog: {card.catalogStatus}</p>
              {card.activeRunStatus ? (
                <p>
                  Current run: {card.activeRunStatus}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
