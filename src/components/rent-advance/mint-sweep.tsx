"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { sweepPendingMintsAction } from "@/lib/rent-advance/actions";

/**
 * Automatically mints every approved, not-yet-minted offer when an Admin page
 * loads. Renders nothing. Idempotent: already-minted offers are skipped.
 */
export function MintSweep() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    sweepPendingMintsAction()
      .then(() => router.refresh())
      .catch(() => {
        // The Admin page stays usable; a mint may be retried from Mint Control.
      });
  }, [router]);

  return null;
}
