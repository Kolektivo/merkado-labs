"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ShareOfferButton({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      const url = new URL(`/offers/${reference}`, window.location.origin).toString();
      if (navigator.share) {
        await navigator.share({ title: `Merkado offer ${reference}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Closing the native share sheet is not an error the user needs to resolve.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void share()}>
      <Share2 aria-hidden />
      {copied ? "Link copied" : "Share offer"}
    </Button>
  );
}
