"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Play, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LabsAdminLogin } from "@/components/labs-admin-login";
import type { AiEnrichmentJob } from "@/lib/domain/types";
import { formatDateTime, titleCase } from "@/lib/format";

type ScopeOption =
  | "listing"
  | "listings"
  | "source"
  | "new_or_changed"
  | "failed"
  | "manual_selection";

type PreviewResult = {
  scope: string;
  totalMatched: number;
  wouldCallOpenAi: number;
  wouldSkipUnchanged: number;
  listingIdsSample: string[];
  force: boolean;
};

export function EnrichmentControlPanel({
  initialListingId,
  initialJobs,
  hasAdminSession = false,
}: {
  initialListingId?: string | null;
  initialJobs: AiEnrichmentJob[];
  hasAdminSession?: boolean;
}) {
  const [scope, setScope] = useState<ScopeOption>(
    initialListingId ? "listing" : "new_or_changed",
  );
  const [sourceKey, setSourceKey] = useState("remax_curacao");
  const [listingIdsText, setListingIdsText] = useState(
    initialListingId ?? "",
  );
  const [maxCount, setMaxCount] = useState("25");
  const [force, setForce] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [jobs, setJobs] = useState(initialJobs);
  const [busy, setBusy] = useState<"preview" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [watchJobId, setWatchJobId] = useState<string | null>(
    initialJobs.find((job) => job.status === "queued" || job.status === "running")
      ?.id ?? null,
  );

  const parsedListingIds = useMemo(
    () =>
      listingIdsText
        .split(/[\s,]+/)
        .map((id) => id.trim())
        .filter(Boolean),
    [listingIdsText],
  );

  const bodyPayload = useCallback(() => {
    const max = Number(maxCount);
    return {
      scope,
      sourceKey,
      listingIds: parsedListingIds,
      maxCount: Number.isFinite(max) && max > 0 ? max : 25,
      force,
    };
  }, [force, maxCount, parsedListingIds, scope, sourceKey]);

  async function adminFetch(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : `Request failed (${response.status})`,
      );
    }
    return payload;
  }

  async function runPreview() {
    setBusy("preview");
    setError(null);
    setMessage(null);
    try {
      const result = (await adminFetch("/api/enrichment/preview", {
        method: "POST",
        body: JSON.stringify(bodyPayload()),
      })) as PreviewResult;
      setPreview(result);
      setMessage(
        `Preview: ${result.wouldCallOpenAi} would call OpenAI, ${result.wouldSkipUnchanged} would skip as unchanged.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runJob() {
    setBusy("run");
    setError(null);
    setMessage(null);
    try {
      const result = await adminFetch("/api/enrichment/jobs", {
        method: "POST",
        body: JSON.stringify(bodyPayload()),
      });
      const jobId = String(result.jobId);
      setWatchJobId(jobId);
      setMessage(`Job ${jobId} queued and Python runner spawned.`);
      await refreshJob(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start job.");
    } finally {
      setBusy(null);
    }
  }

  async function refreshJob(jobId: string) {
    let payload: Record<string, unknown>;
    try {
      payload = await adminFetch(`/api/enrichment/jobs/${jobId}`) as Record<string, unknown>;
    } catch {
      return;
    }
    const mapped: AiEnrichmentJob = {
      id: String(payload.id),
      scopeType: String(payload.scopeType),
      scopeFilter: payload.scopeFilter,
      propertySourceId: payload.propertySourceId ? String(payload.propertySourceId) : null,
      requestedBy: payload.requestedBy ? String(payload.requestedBy) : null,
      status: String(payload.status),
      model: String(payload.model),
      promptVersion: String(payload.promptVersion),
      schemaVersion: String(payload.schemaVersion),
      totalListings: Number(payload.totalListings ?? 0),
      processedCount: Number(payload.processedCount ?? 0),
      succeededCount: Number(payload.succeededCount ?? 0),
      skippedUnchangedCount: Number(payload.skippedUnchangedCount ?? 0),
      failedCount: Number(payload.failedCount ?? 0),
      currentBatch:
        payload.currentBatch === null || payload.currentBatch === undefined
          ? null
          : Number(payload.currentBatch),
      currentListingId: payload.currentListingId ? String(payload.currentListingId) : null,
      tokenUsage: payload.tokenUsage,
      errors: payload.errors,
      summary: payload.summary,
      createdAt: String(payload.createdAt),
      startedAt: payload.startedAt ? String(payload.startedAt) : null,
      completedAt: payload.completedAt ? String(payload.completedAt) : null,
    };
    setJobs((current) => {
      const without = current.filter((job) => job.id !== mapped.id);
      return [mapped, ...without].slice(0, 12);
    });
    if (!["queued", "running"].includes(mapped.status)) {
      setWatchJobId((current) => (current === jobId ? null : current));
    }
  }

  useEffect(() => {
    if (!watchJobId) return;
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void refreshJob(watchJobId);
    };
    tick();
    const timer = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [watchJobId]);

  const activeJob =
    jobs.find((job) => job.id === watchJobId) ??
    jobs.find((job) => ["queued", "running"].includes(job.status)) ??
    jobs[0] ??
    null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin gate</CardTitle>
          <CardDescription>
            Unlock once with the server-side Labs admin secret. The secret is
            never kept in sessionStorage/localStorage; the browser only receives
            a signed httpOnly session cookie.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LabsAdminLogin hasSession={hasAdminSession} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scope</CardTitle>
          <CardDescription>
            Choose what to enrich. OpenAI runs only in the Python job worker —
            never in the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={scope}
                onValueChange={(value) => setScope(value as ScopeOption)}
              >
                <SelectTrigger className="w-full" aria-label="Enrichment scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="listing">Current listing</SelectItem>
                  <SelectItem value="manual_selection">Selected IDs</SelectItem>
                  <SelectItem value="listings">Listings (IDs)</SelectItem>
                  <SelectItem value="source">One source</SelectItem>
                  <SelectItem value="new_or_changed">New / not run</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source key</Label>
              <Select value={sourceKey} onValueChange={setSourceKey}>
                <SelectTrigger className="w-full" aria-label="Source key">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remax_curacao">remax_curacao</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-count">Max count</Label>
              <Input
                id="max-count"
                type="number"
                min={1}
                max={500}
                value={maxCount}
                onChange={(event) => setMaxCount(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="listing-ids">Listing IDs</Label>
            <Input
              id="listing-ids"
              value={listingIdsText}
              onChange={(event) => setListingIdsText(event.target.value)}
              placeholder="UUID(s), comma or space separated"
            />
            {initialListingId ? (
              <p className="text-xs text-muted-foreground">
                Prefilled from listing{" "}
                <Link
                  className="underline underline-offset-2"
                  href={`/listings/${initialListingId}`}
                >
                  detail
                </Link>
                .
              </p>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              className="size-4 rounded border"
            />
            Force re-run even when input checksum is unchanged
          </label>

          <Alert>
            <AlertTriangle />
            <AlertTitle>Cost warning</AlertTitle>
            <AlertDescription>
              Each listing that is not skipped calls OpenAI. Preview first,
              keep max count low, and prefer new/changed or failed scopes.
              Proposals never overwrite source price, status, dates, or
              coordinates.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void runPreview()}
              disabled={busy !== null}
            >
              {busy === "preview" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Preview counts
            </Button>
            <Button
              type="button"
              onClick={() => void runJob()}
              disabled={busy !== null}
            >
              {busy === "run" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Start enrichment job
            </Button>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}

          {preview ? (
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <dt className="text-xs uppercase text-muted-foreground">
                  Matched
                </dt>
                <dd className="mt-1 font-mono text-xl font-semibold">
                  {preview.totalMatched}
                </dd>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <dt className="text-xs uppercase text-muted-foreground">
                  Would call OpenAI
                </dt>
                <dd className="mt-1 font-mono text-xl font-semibold">
                  {preview.wouldCallOpenAi}
                </dd>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <dt className="text-xs uppercase text-muted-foreground">
                  Would skip
                </dt>
                <dd className="mt-1 font-mono text-xl font-semibold">
                  {preview.wouldSkipUnchanged}
                </dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job progress</CardTitle>
          <CardDescription>
            Latest jobs from Labs. Running jobs poll every few seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeJob ? (
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{titleCase(activeJob.status.replaceAll("_", " "))}</Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {activeJob.id}
                </span>
              </div>
              <p className="mt-3 text-sm">
                {activeJob.processedCount}/{activeJob.totalListings} processed ·{" "}
                {activeJob.succeededCount} succeeded ·{" "}
                {activeJob.skippedUnchangedCount} skipped ·{" "}
                {activeJob.failedCount} failed
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Model {activeJob.model} · created{" "}
                {formatDateTime(activeJob.createdAt)}
                {activeJob.startedAt
                  ? ` · started ${formatDateTime(activeJob.startedAt)}`
                  : ""}
                {activeJob.completedAt
                  ? ` · completed ${formatDateTime(activeJob.completedAt)}`
                  : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No enrichment jobs yet.</p>
          )}

          {jobs.length > 1 ? (
            <ul className="space-y-2">
              {jobs.slice(0, 8).map((job) => (
                <li
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs">{job.id.slice(0, 8)}…</span>
                  <Badge variant="outline">
                    {titleCase(job.status.replaceAll("_", " "))}
                  </Badge>
                  <span className="text-muted-foreground">
                    {job.processedCount}/{job.totalListings}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setWatchJobId(job.id);
                      void refreshJob(job.id);
                    }}
                  >
                    Watch
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
