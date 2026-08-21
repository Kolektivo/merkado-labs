"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { MockWalletConnection } from "@/components/mock-wallet-connection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { subscribeOfferAction } from "@/lib/rent-advance/actions";
import { formatXcg } from "@/lib/rent-advance/money";

export function SubscribeForm({
  reference,
  remainingCents,
  fundedCents,
  offeringCents,
  expiresLabel,
}: {
  reference: string;
  remainingCents: number;
  fundedCents: number;
  offeringCents: number;
  expiresLabel: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const closed = remainingCents <= 0;

  if (closed) {
    return fundedCents > 0 ? (
      <div className="rounded-2xl border border-grey-200 bg-white p-6 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
        <p className="text-sm font-medium text-grey-800">
          Offering
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-surface-dark">
          Filled
        </p>
        <p className="mt-1 text-sm text-grey-800">
          {formatXcg(offeringCents)} committed
        </p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-grey-200">
          <div className="h-full w-full rounded-full bg-violet-500" />
        </div>
        <Button asChild className="mt-6 h-11 w-full">
          <Link href={`/portfolio/${reference}`}>View in Portfolio</Link>
        </Button>
      </div>
    ) : null;
  }

  return (
    <div className="rounded-2xl border border-primary/25 bg-white p-6 shadow-sm">
      {error ? (
        <Alert variant="destructive" className="mb-5">
          <AlertTitle>Could not complete purchase</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <p className="text-sm font-medium text-grey-800">Whole offer</p>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight text-surface-dark tabular-nums">
        {formatXcg(remainingCents)}
      </p>
      <p className="mt-1 text-sm text-grey-800">
        100% ownership · no fractional purchase
      </p>
      {expiresLabel ? (
        <p className="mt-2 text-xs text-grey-800">
          Available until {expiresLabel} · 60-day listing window
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        <MockWalletConnection
          connected={connected}
          onConnect={() => setConnected(true)}
        />
        {connected ? (
          <Button
            type="button"
            className="h-11 px-4"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await subscribeOfferAction(reference, remainingCents);
                  try {
                    window.sessionStorage.setItem(
                      `merkado:success:purchase:${reference}`,
                      formatXcg(remainingCents),
                    );
                  } catch {
                    // The purchase succeeded; the amount is optional dialog detail.
                  }
                  router.push(`/portfolio/${reference}?success=purchase`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Purchase failed.");
                }
              });
            }}
          >
            {pending
              ? "Purchasing…"
              : `Purchase whole offer · ${formatXcg(remainingCents)}`}
          </Button>
        ) : null}
      </div>

      {fundedCents > 0 ? (
        <Link
          href={`/portfolio/${reference}`}
          className="mt-4 flex min-h-11 items-center justify-center text-center text-sm text-grey-800 hover:text-surface-dark"
        >
          View current position
        </Link>
      ) : (
        <p className="mt-4 text-center text-xs leading-5 text-grey-800">
          After purchase, the offer moves to Portfolio. Rent paid to the
          offer address can be claimed by its owner.
        </p>
      )}

    </div>
  );
}
