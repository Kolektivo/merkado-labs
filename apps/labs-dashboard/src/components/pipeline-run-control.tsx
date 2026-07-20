"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function PipelineRunControl({
  runId,
  status,
}: {
  runId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = status === "queued" ? "cancel" : "stop";
  const label = status === "queued" ? "Cancel queued run" : "Stop after current item";

  if (!["queued", "running"].includes(status)) return null;

  async function submit() {
    const confirmed = window.confirm(
      action === "cancel"
        ? "Cancel this queued refresh? No source work has started."
        : "Ask the worker to stop after the current listing? Completed work will remain saved.",
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/pipeline/runs/${runId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "The run could not be updated.");
      }
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The run could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? "Updating…" : label}
      </Button>
      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
