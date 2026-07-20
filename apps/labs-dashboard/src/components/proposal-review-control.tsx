"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AiProposalReviewStatus } from "@/lib/domain/types";

export function ProposalReviewControl({
  proposalId,
  initialStatus,
  initialNotes,
}: {
  proposalId: string;
  initialStatus: AiProposalReviewStatus;
  initialNotes: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<AiProposalReviewStatus>(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/enrichment/proposals/${proposalId}/review`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewStatus: status, reviewNotes: notes }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Review update failed.");
      setMessage({
        kind: "success",
        text: "Review saved. The original listing facts were not changed.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Review update failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="mb-3 text-sm font-medium">Your review decision</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="review-status">Decision</Label>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as AiProposalReviewStatus)}
          >
            <SelectTrigger id="review-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unreviewed">Not decided yet</SelectItem>
              <SelectItem value="approved_for_research">
                Approve (research use only)
              </SelectItem>
              <SelectItem value="needs_changes">Needs changes</SelectItem>
              <SelectItem value="rejected">Reject</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="review-notes">Notes</Label>
          <Input
            id="review-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional — why you decided this"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={() => void submit()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Saving…" : "Save review"}
        </Button>
        {message ? (
          <p
            className={
              message.kind === "success"
                ? "inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"
                : "text-xs text-destructive"
            }
            role="status"
          >
            {message.kind === "success" ? (
              <CheckCircle2 className="size-3.5" />
            ) : null}
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
