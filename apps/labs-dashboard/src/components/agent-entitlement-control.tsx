"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { FieldLabel } from "@/components/field-label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PropertySearchRequest } from "@/lib/domain/types";

export function AgentEntitlementControl({
  requests,
}: {
  requests: PropertySearchRequest[];
}) {
  const router = useRouter();
  const [requestId, setRequestId] = useState(requests[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  async function create() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/agent/entitlements", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to create the access pass.");
      }
      setMessage({ kind: "success", text: "Test access pass saved." });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to create the access pass.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!requests.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No confirmed search requests yet —{" "}
        <Link
          href="/search-requests"
          className="font-medium text-foreground underline underline-offset-2"
        >
          create a draft on Search requests
        </Link>
        , open it, and tap Confirm before creating a test access pass.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56">
          <FieldLabel>Search request</FieldLabel>
          <Select value={requestId} onValueChange={setRequestId}>
            <SelectTrigger className="w-full" aria-label="Search request">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {requests.map((request) => (
                <SelectItem key={request.id} value={request.id}>
                  {request.title ?? request.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" size="sm" onClick={() => void create()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Saving…" : "Save test access pass"}
        </Button>
      </div>
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
  );
}
