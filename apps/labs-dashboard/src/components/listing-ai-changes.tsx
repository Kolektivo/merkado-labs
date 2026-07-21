"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { ProposalReviewControl } from "@/components/proposal-review-control";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AiEnrichmentProposal } from "@/lib/domain/types";
import {
  calculateUsageCostUsd,
  COST_ESTIMATE_LABEL,
  formatUsd,
  isSuccessfulProposalStatus,
  parseTokenUsage,
  sumCostUsd,
  totalTokenCount,
} from "@/lib/enrichment/cost";
import {
  CURRENT_POLICY_VERSION,
  decisionStatusLabel,
  explainAttentionReview,
  extractFieldDecisions,
  isCurrentPolicyVersions,
  isOperationalAttentionDecision,
  reasonDisplays,
  selectRetainedProposal,
  type FieldDecisionView,
} from "@/lib/enrichment/display";
import { formatDateTime, formatNumber } from "@/lib/format";

function statusTone(
  status: FieldDecisionView["status"],
): "success" | "warning" | "error" | "neutral" {
  if (status === "auto_applied") return "success";
  if (status === "needs_attention") return "warning";
  if (status === "rejected") return "error";
  return "neutral";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function isTechnicalAuditStatus(status: FieldDecisionView["status"]): boolean {
  return (
    status === "rejected" ||
    status === "skipped" ||
    status === "redundant" ||
    status === "not_evaluated"
  );
}

export function ListingAiChanges({
  proposals,
  selectedChecksum,
  sourceNeighbourhoodText = null,
  mapNeighbourhoodName = null,
}: {
  proposals: AiEnrichmentProposal[];
  selectedChecksum?: string | null;
  sourceNeighbourhoodText?: string | null;
  mapNeighbourhoodName?: string | null;
}) {
  const retained = useMemo(
    () => selectRetainedProposal(proposals, selectedChecksum),
    [proposals, selectedChecksum],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    proposals.find((item) => item.id === selectedId) ??
    retained ??
    proposals[0] ??
    null;

  if (!proposals.length || !selected) {
    return (
      <Card>
        <CardHeader className="border-b">
          <CardTitle>AI changes</CardTitle>
          <CardDescription>
            No enrichment runs yet. Successful high-confidence fields will apply
            automatically when enrichment is enabled.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const attentionContext = {
    sourceNeighbourhood: sourceNeighbourhoodText,
    mapNeighbourhood: mapNeighbourhoodName,
  };
  const decisions = extractFieldDecisions(selected.proposal, {
    model: selected.model,
    generatedAt: selected.generatedAt,
  });
  const attention = decisions.filter((d) =>
    isOperationalAttentionDecision(d, attentionContext),
  );
  const applied = decisions.filter((d) => d.status === "auto_applied");
  const technicalAudit = decisions.filter((d) =>
    isTechnicalAuditStatus(d.status),
  );
  const evidence = selected.supportingEvidence;
  const runAudit =
    evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? (evidence as Record<string, unknown>).run_audit
      : null;
  const audit =
    runAudit && typeof runAudit === "object" && !Array.isArray(runAudit)
      ? (runAudit as Record<string, unknown>)
      : null;

  const latest = retained ?? proposals[0]!;
  const latestTokens = parseTokenUsage(latest.tokenUsage);
  const latestCostUsd = calculateUsageCostUsd(latest.model, latestTokens);
  const latestDecisions = extractFieldDecisions(latest.proposal, {
    model: latest.model,
    generatedAt: latest.generatedAt,
  });
  const latestApplied = latestDecisions.filter(
    (d) => d.status === "auto_applied",
  ).length;
  const latestAttention = latestDecisions.filter((d) =>
    isOperationalAttentionDecision(d, attentionContext),
  ).length;
  const cumulativeCostUsd = sumCostUsd(
    proposals.map((item) =>
      calculateUsageCostUsd(item.model, parseTokenUsage(item.tokenUsage)),
    ),
  );
  const latestIsRetained = isSuccessfulProposalStatus(latest.status);
  const failedOrSupersededCount = latestIsRetained
    ? proposals.length - 1
    : proposals.length;
  const selectedIsCurrentPolicy = isCurrentPolicyVersions(
    selected.promptVersion,
    selected.schemaVersion,
  );
  const selectedIsRetained = retained?.id === selected.id;
  const historicalRuns = proposals.filter((item) => item.id !== selected.id);

  return (
    <div className="space-y-4">
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-medium">
          AI run and cost details
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">
          Model, token use, estimated cost, and prior attempts.
        </p>
        <div className="mt-4">
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Current model</dt>
              <dd className="font-mono">{latest.model}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Current enrichment time
              </dt>
              <dd>{formatDateTime(latest.generatedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Current run tokens / cost
              </dt>
              <dd>
                {formatNumber(totalTokenCount(latestTokens))} tokens ·{" "}
                <span className="font-mono">{formatUsd(latestCostUsd)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Fields applied / attention (current result)
              </dt>
              <dd>
                {latestApplied} applied · {latestAttention} attention
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Cumulative attempts{proposals.length >= 50 ? " (last 50)" : ""}
              </dt>
              <dd>{proposals.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Cumulative estimated cost
              </dt>
              <dd className="font-mono">{formatUsd(cumulativeCostUsd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Failed / superseded attempts
              </dt>
              <dd>{failedOrSupersededCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Policy version</dt>
              <dd className="font-mono text-xs">{CURRENT_POLICY_VERSION}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {COST_ESTIMATE_LABEL}
          </p>
        </div>
      </details>
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>AI changes</CardTitle>
                <Badge variant="outline" className="font-normal">
                  AI extracted
                </Badge>
                {selectedIsRetained ? (
                  <Badge variant="secondary" className="font-normal">
                    Current result
                  </Badge>
                ) : (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    Historical run
                  </Badge>
                )}
                {selectedIsCurrentPolicy ? (
                  <Badge variant="outline" className="font-normal">
                    {CURRENT_POLICY_VERSION}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    Obsolete policy
                  </Badge>
                )}
              </div>
              <CardDescription>
                Latest effective decision per field from the current retained
                enrichment result. Exceptions are highlighted; successful
                auto-applied fields do not need approval.
              </CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link href="/enrichment?view=attention&filter=needs_attention">
                <Sparkles data-icon="inline-start" />
                Open needs attention
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <StatusBadge tone="success">
              {applied.length} auto-applied
            </StatusBadge>
            <StatusBadge tone="warning">
              {attention.length} need attention
            </StatusBadge>
            <StatusBadge tone="neutral">
              {technicalAudit.length} rejected / ignored
            </StatusBadge>
            <Badge variant="outline">{selected.model}</Badge>
          </div>

          {attention.length ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Needs review
              </h3>
              <DecisionTable decisions={attention} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No fields need attention for the current result.
            </p>
          )}

          {applied.length ? (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Applied changes ({applied.length})
              </summary>
              <div className="mt-3">
                <DecisionTable decisions={applied} />
              </div>
            </details>
          ) : null}

          {technicalAudit.length ? (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Rejected / ignored technical audit ({technicalAudit.length})
              </summary>
              <div className="mt-3">
                <DecisionTable decisions={technicalAudit} />
              </div>
            </details>
          ) : null}

          <details className="rounded-lg border border-dashed p-3">
            <summary className="cursor-pointer text-sm font-medium">
              History / advanced
              {historicalRuns.length
                ? ` (${historicalRuns.length} older run${
                    historicalRuns.length === 1 ? "" : "s"
                  })`
                : ""}
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Older runs and obsolete policy decisions stay here. They do not
                count as current review work.
              </p>
              <div className="flex flex-wrap gap-2">
                {proposals.map((item) => {
                  const active = item.id === selected.id;
                  const isRetainedRow = retained?.id === item.id;
                  const isCurrentPolicy = isCurrentPolicyVersions(
                    item.promptVersion,
                    item.schemaVersion,
                  );
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Badge
                        variant={active ? "default" : "outline"}
                        className="font-normal"
                      >
                        {formatDateTime(item.generatedAt)} · {item.model}
                        {isRetainedRow ? " · current" : ""}
                        {!isCurrentPolicy ? " · obsolete" : ""}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              {audit ? (
                <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>Proposed: {String(audit.fields_proposed ?? "—")}</div>
                  <div>
                    Input fingerprint:{" "}
                    <span className="break-all font-mono">
                      {String(audit.input_checksum ?? selected.inputChecksum)}
                    </span>
                  </div>
                  <div>
                    Prompt / schema:{" "}
                    <span className="font-mono">
                      {selected.promptVersion} / {selected.schemaVersion}
                    </span>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Prompt / schema:{" "}
                  <span className="font-mono">
                    {selected.promptVersion} / {selected.schemaVersion}
                  </span>
                </p>
              )}
              <ProposalReviewControl
                proposalId={selected.id}
                initialStatus={selected.reviewStatus}
                initialNotes={selected.reviewNotes}
              />
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

function DecisionTable({ decisions }: { decisions: FieldDecisionView[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Before</th>
            <th className="px-3 py-2 font-medium">After</th>
            <th className="px-3 py-2 font-medium">Why / evidence</th>
            <th className="px-3 py-2 font-medium">Confidence</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((decision, index) => {
            const reasons = reasonDisplays(decision.reasons);
            const attentionNote = explainAttentionReview(decision);
            return (
              <tr
                key={`${decision.key}-${decision.status}-${index}`}
                className="border-t"
              >
                <td className="px-3 py-2 font-medium">{decision.displayLabel}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatValue(decision.before)}
                </td>
                <td className="px-3 py-2">{formatValue(decision.after)}</td>
                <td className="max-w-xs px-3 py-2 text-xs text-muted-foreground">
                  {reasons.length ? (
                    <ul className="mb-1 list-disc space-y-0.5 pl-4">
                      {reasons.map((reason, reasonIndex) => (
                        <li key={`${reason.code}-${reasonIndex}`}>
                          <span>{reason.label}</span>
                          <span className="ml-1 font-mono text-[10px] text-muted-foreground/80">
                            ({reason.code})
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {attentionNote ? (
                    <p className="mb-1 rounded bg-amber-50 px-2 py-1 text-[11px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      {attentionNote}
                    </p>
                  ) : null}
                  {decision.evidence ? (
                    <p
                      className={
                        reasons.length || attentionNote
                          ? "border-t border-border/60 pt-1 italic"
                          : undefined
                      }
                    >
                      {decision.evidence}
                    </p>
                  ) : null}
                  {!reasons.length && !decision.evidence && !attentionNote
                    ? "—"
                    : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {decision.confidence !== null
                    ? `${Math.round(decision.confidence * 100)}%`
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge tone={statusTone(decision.status)}>
                    {decisionStatusLabel(decision.status)}
                  </StatusBadge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
