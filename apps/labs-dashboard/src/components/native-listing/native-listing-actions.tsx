"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

const ACTIONS: Array<{
  action: string;
  label: string;
  variant?: "default" | "outline" | "secondary";
}> = [
  { action: "publish", label: "Publish", variant: "default" },
  { action: "unpublish", label: "Unpublish", variant: "outline" },
  { action: "mark_sold", label: "Mark sold", variant: "secondary" },
  { action: "mark_rented", label: "Mark rented", variant: "secondary" },
  { action: "republish", label: "Republish", variant: "outline" },
];

export function NativeListingActions({
  listingId,
  status,
}: {
  listingId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/native-listings/${listingId}/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Action failed.");
        setMessage(`Updated: ${action.replaceAll("_", " ")}.`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Native listing management</p>
          <p className="text-xs text-muted-foreground">
            Origin manual · status {status}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/listings/${listingId}/edit`}>Edit</Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((item) => (
          <Button
            key={item.action}
            type="button"
            size="sm"
            variant={item.variant ?? "outline"}
            disabled={pending}
            onClick={() => run(item.action)}
          >
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            {item.label}
          </Button>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
