"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { resetDemoAction } from "@/lib/rent-advance/actions";

export function ResetDemoButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Restore the seeded offers, payments, and distributions?
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            setDone(false);
            startTransition(async () => {
              try {
                setError(null);
                await resetDemoAction();
                setDone(true);
                setConfirming(false);
                router.refresh();
              } catch {
                setError("The demo could not be reset. Try again.");
              }
            });
          }}
        >
          {pending ? "Resetting…" : "Yes, reset"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setDone(false);
          setConfirming(true);
        }}
      >
        Reset demo
      </Button>
      {done ? (
        <p className="text-sm text-muted-foreground">Seeded book restored.</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
