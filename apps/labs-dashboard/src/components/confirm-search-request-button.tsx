"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ConfirmSearchRequestButton({
  requestId,
  initialStatus,
}: {
  requestId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  if (status === "confirmed") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <p className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5" />
          Confirmed for Labs testing
        </p>
        <Link
          href="/agent"
          className="font-medium text-foreground underline underline-offset-2"
        >
          Create an Agent test pass
        </Link>
      </div>
    );
  }

  if (status !== "draft") {
    return (
      <p className="text-sm text-muted-foreground">
        This request is {status.replaceAll("_", " ")} and cannot be confirmed.
      </p>
    );
  }

  async function confirm() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/search-requests/${requestId}/confirm`, {
        method: "POST",
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to confirm request.");
      }
      setStatus("confirmed");
      setMessage({
        kind: "success",
        text: "Request confirmed. You can create a Merkado Agent test pass now.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to confirm request.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" onClick={() => void confirm()} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? "Confirming…" : "Confirm request"}
      </Button>
      {message ? (
        <p
          className={
            message.kind === "success"
              ? "text-xs text-emerald-600 dark:text-emerald-400"
              : "text-xs text-destructive"
          }
          role="status"
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
