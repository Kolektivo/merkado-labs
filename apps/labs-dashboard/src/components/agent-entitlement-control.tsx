"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { PropertySearchRequest } from "@/lib/domain/types";

export function AgentEntitlementControl({
  requests,
}: {
  requests: PropertySearchRequest[];
}) {
  const [requestId, setRequestId] = useState(requests[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);

  async function create() {
    const response = await fetch("/api/agent/entitlements", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(
      response.ok
        ? "Test entitlement created."
        : (result.error ?? "Unable to create entitlement."),
    );
  }

  if (!requests.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No confirmed search requests are available.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={requestId}
        onChange={(event) => setRequestId(event.target.value)}
        className="h-9 rounded-md border bg-background px-3 text-sm"
      >
        {requests.map((request) => (
          <option key={request.id} value={request.id}>
            {request.title ?? request.id}
          </option>
        ))}
      </select>
      <Button size="sm" onClick={() => void create()}>
        Create test entitlement
      </Button>
      {message ? (
        <span className="text-xs text-muted-foreground">{message}</span>
      ) : null}
    </div>
  );
}
