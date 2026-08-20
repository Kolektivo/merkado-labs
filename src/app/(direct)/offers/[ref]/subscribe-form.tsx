"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { subscribeOfferAction } from "@/lib/rent-advance/actions";
import { positionIdFor } from "@/lib/rent-advance/ids";
import {
  formatXcg,
  usdCentsToXcgInput,
  xcgMajorToUsdCents,
} from "@/lib/rent-advance/money";

export function SubscribeForm({
  reference,
  remainingCents,
  fundedCents,
  offeringCents,
}: {
  reference: string;
  remainingCents: number;
  fundedCents: number;
  offeringCents: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amountXcg, setAmountXcg] = useState(usdCentsToXcgInput(remainingCents));

  const amountCents = useMemo(() => {
    const parsed = xcgMajorToUsdCents(Number(amountXcg));
    return Number.isFinite(parsed) ? parsed : 0;
  }, [amountXcg]);

  const closed = remainingCents <= 0;
  const canBuy = amountCents > 0 && amountCents <= remainingCents;

  function setShare(share: number) {
    setAmountXcg(usdCentsToXcgInput(Math.max(1, Math.round(remainingCents * share))));
  }

  if (closed) {
    return fundedCents > 0 ? (
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">This offering is filled.</p>
        <Button asChild className="mt-3">
          <Link href={`/portfolio/${reference}`}>
            View position {positionIdFor(reference)}
          </Link>
        </Button>
      </div>
    ) : null;
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not complete purchase</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div>
        <p className="text-sm font-medium">Buy a portion</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose any amount up to what is still open. Later rent from this
          property goes to Portfolio when the renter pays.
        </p>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Filled</dt>
          <dd className="tabular-nums">
            {formatXcg(fundedCents)} of {formatXcg(offeringCents)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Still open</dt>
          <dd className="font-medium tabular-nums">{formatXcg(remainingCents)}</dd>
        </div>
      </dl>

      <div className="space-y-1.5">
        <Label htmlFor="purchase-amount">Amount (XCG)</Label>
        <Input
          id="purchase-amount"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={amountXcg}
          onChange={(event) => setAmountXcg(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setShare(0.25)}>
          25%
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setShare(0.5)}>
          50%
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAmountXcg(usdCentsToXcgInput(remainingCents))}
        >
          All remaining
        </Button>
      </div>

      <Button
        type="button"
        className="min-h-10 w-full"
        disabled={pending || !canBuy}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await subscribeOfferAction(reference, amountCents);
              router.push(`/portfolio/${reference}`);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Purchase failed.");
            }
          });
        }}
      >
        {pending ? "Purchasing…" : `Purchase · ${formatXcg(amountCents)}`}
      </Button>

      {fundedCents > 0 ? (
        <Button variant="ghost" size="sm" asChild className="w-full">
          <Link href={`/portfolio/${reference}`}>
            View current position {positionIdFor(reference)}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
