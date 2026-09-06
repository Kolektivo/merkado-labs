"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { sweepPendingMintsAction } from "@/lib/rent-advance/actions";

/**
 * Automatically mints every approved, not-yet-minted offer when an Admin page
 * loads. Renders nothing. Idempotent: already-minted offers are skipped.
 */
export function MintSweep() {
  const router = useRouter();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    sweepPendingMintsAction().then((result) => {
      const failed = result.results.find(
        (item) => item.status !== "confirmed" && item.reason,
      );
      if (failed) {
        setError(`${failed.reference}: ${failed.reason}`);
      }
      router.refresh();
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Automatic minting failed.");
    });
  }, [router]);

  return error ? (
    <Alert variant="destructive">
      <AlertTitle>Automatic minting needs attention</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;
}
