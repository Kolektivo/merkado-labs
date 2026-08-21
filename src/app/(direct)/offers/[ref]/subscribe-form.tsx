"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { HelpTip } from "@/components/help-tip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { subscribeOfferAction } from "@/lib/rent-advance/actions";
import {
  formatXcg,
  usdCentsToXcgInput,
  xcgMajorToUsdCents,
} from "@/lib/rent-advance/money";
import { cn } from "@/lib/utils";

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
  const filledPct =
    offeringCents > 0 ? Math.min(100, (fundedCents / offeringCents) * 100) : 0;

  const share25 = Math.max(1, Math.round(remainingCents * 0.25));
  const share50 = Math.max(1, Math.round(remainingCents * 0.5));
  const selectedChip =
    amountCents === remainingCents
      ? "all"
      : amountCents === share50
        ? "50"
        : amountCents === share25
          ? "25"
          : null;

  function setShare(cents: number) {
    setAmountXcg(usdCentsToXcgInput(cents));
  }

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

      <p className="text-sm font-medium text-grey-800">
        Still open
      </p>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight text-surface-dark tabular-nums">
        {formatXcg(remainingCents)}
      </p>
      <p className="mt-1 text-sm text-grey-800">
        of {formatXcg(offeringCents)}
      </p>

      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-grey-200">
        <div
          className="h-full rounded-full bg-violet-500"
          style={{ width: `${filledPct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-grey-800">
        {formatXcg(fundedCents)} filled
      </p>

      <div className="mt-6 space-y-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor="purchase-amount" className="text-sm text-grey-800">
            Your amount
          </Label>
          <HelpTip label="Purchase amount">
            Choose how much of the amount still open you want to buy.
          </HelpTip>
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-grey-800">
            XCG
          </span>
          <Input
            id="purchase-amount"
            type="text"
            inputMode="decimal"
            value={amountXcg}
            aria-invalid={amountXcg.length > 0 && !canBuy}
            aria-describedby="purchase-amount-hint"
            onChange={(event) =>
              setAmountXcg(event.target.value.replace(",", "."))
            }
            className="h-11 pl-12"
          />
        </div>
        <p id="purchase-amount-hint" className="text-xs text-grey-800">
          {amountXcg.length > 0 && amountCents > remainingCents
            ? `Up to ${formatXcg(remainingCents)} is still open.`
            : amountXcg.length > 0 && amountCents <= 0
              ? "Enter an amount above zero."
              : "25% and 50% are shares of what’s still open."}
        </p>
      </div>

      <div className="mt-3 flex gap-1.5">
        {(
          [
            { key: "25", label: "25%", cents: share25 },
            { key: "50", label: "50%", cents: share50 },
            { key: "all", label: "All", cents: remainingCents },
          ] as const
        ).map((chip) => (
          <Button
            key={chip.key}
            type="button"
            variant="outline"
            aria-pressed={selectedChip === chip.key}
            className={cn(
              "h-11 flex-1",
              selectedChip === chip.key &&
                "border-primary bg-primary/5 text-primary",
            )}
            onClick={() => setShare(chip.cents)}
          >
            {chip.label}
          </Button>
        ))}
      </div>

      <Button
        type="button"
        className="mt-6 h-11 w-full"
        disabled={pending || !canBuy}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await subscribeOfferAction(reference, amountCents);
              try {
                window.sessionStorage.setItem(
                  `merkado:success:purchase:${reference}`,
                  formatXcg(amountCents),
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
        {pending ? "Purchasing…" : `Purchase · ${formatXcg(amountCents)}`}
      </Button>

      {fundedCents > 0 ? (
        <Link
          href={`/portfolio/${reference}`}
          className="mt-4 flex min-h-11 items-center justify-center text-center text-sm text-grey-800 hover:text-surface-dark"
        >
          View current position
        </Link>
      ) : (
        <p className="mt-4 text-center text-xs leading-5 text-grey-800">
          Later rent goes to your portfolio when the renter pays.
        </p>
      )}

    </div>
  );
}
