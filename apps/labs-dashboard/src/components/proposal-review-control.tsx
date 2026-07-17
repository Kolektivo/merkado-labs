"use client";

import { useState } from "react";

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
  const [status, setStatus] = useState<AiProposalReviewStatus>(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [message, setMessage] = useState<string | null>(null);
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
      setMessage("Review saved. Source listing facts were not changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Review status</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as AiProposalReviewStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unreviewed">Unreviewed</SelectItem>
              <SelectItem value="approved_for_research">Approved for research</SelectItem>
              <SelectItem value="needs_changes">Needs changes</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Review notes</Label>
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Requires an active Labs admin session cookie (unlock from Enrichment or Settings).
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" size="sm" onClick={() => void submit()} disabled={busy}>
          {busy ? "Saving…" : "Save review"}
        </Button>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}
