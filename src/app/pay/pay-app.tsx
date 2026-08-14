"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PAYER_UNCHANGED_BY_LOCALE } from "@/lib/rent-advance/copy";
import { formatXcg } from "@/lib/rent-advance/money";
import { payerPayNowAction } from "@/lib/rent-advance/actions";

import { LanguageToggle, usePayerLocale } from "./payer-locale";

type RecentPayment = {
  dateLabel: string;
  amountCents: number;
};

export function PayApp({
  address,
  district,
  nextAmountCents,
  nextDueLabel,
  payee,
  reference,
  canPay,
  recentPayments,
}: {
  address: string;
  district: string;
  nextAmountCents: number;
  nextDueLabel: string;
  payee: string;
  reference: string;
  canPay: boolean;
  recentPayments: RecentPayment[];
}) {
  const { copy, locale } = usePayerLocale();

  return (
    <div className="space-y-6">
      <LanguageToggle />

      <div>
        <p className="text-sm text-muted-foreground">{copy.greeting}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{copy.allSet}</h1>
      </div>

      <div>
        <p className="text-sm font-medium">{copy.whatDoesNotChange}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {PAYER_UNCHANGED_BY_LOCALE[locale].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <Card>
        <CardContent className="space-y-1 pt-6">
          <p className="font-medium">{address}</p>
          <p className="text-sm text-muted-foreground">{district}, Curaçao</p>
        </CardContent>
      </Card>

      <NextPaymentCard
        key={`${nextDueLabel}-${canPay}`}
        nextAmountCents={nextAmountCents}
        nextDueLabel={nextDueLabel}
        payee={payee}
        reference={reference}
        canPay={canPay}
      />

      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          {copy.noticeTitle}
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>{copy.weAreNotLandlord}</p>
          <p>{copy.optionA}</p>
          <p>{copy.afterTerm}</p>
          <p className="text-xs text-muted-foreground">
            {copy.landlordCountersign}
          </p>
        </div>
      </details>

      <div className="space-y-2 text-sm">
        <p className="font-medium">{copy.recentPayments}</p>
        {recentPayments.length === 0 ? (
          <p className="text-muted-foreground">{copy.noPaymentsYet}</p>
        ) : (
          recentPayments.map((row) => (
            <p key={`${row.dateLabel}-${row.amountCents}`}>
              {row.dateLabel} · {formatXcg(row.amountCents)} · {copy.paid}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function NextPaymentCard({
  nextAmountCents,
  nextDueLabel,
  payee,
  reference,
  canPay,
}: {
  nextAmountCents: number;
  nextDueLabel: string;
  payee: string;
  reference: string;
  canPay: boolean;
}) {
  const { copy } = usePayerLocale();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function confirm() {
    try {
      await payerPayNowAction("MRA-001");
      setState("done");
      setMessage(`${copy.paid} ${formatXcg(nextAmountCents)}`);
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Payment could not be recorded.",
      );
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <p className="text-sm text-muted-foreground">{copy.nextPayment}</p>
        <p className="text-3xl font-semibold tabular-nums">
          {formatXcg(nextAmountCents)}
        </p>
        <p className="text-sm">
          {copy.due} {nextDueLabel} {copy.to} {payee}, {copy.reference}{" "}
          {reference}
        </p>
        <p className="text-sm text-muted-foreground">
          {copy.optionATitle} · {copy.current}
        </p>
        {canPay && state !== "done" ? (
          <Button type="button" onClick={() => void confirm()}>
            {copy.confirmPay} {formatXcg(nextAmountCents)}
          </Button>
        ) : null}
        {!canPay && state !== "done" ? (
          <Alert>
            <AlertTitle>{copy.allSet}</AlertTitle>
            <AlertDescription>{copy.noPaymentsYet}</AlertDescription>
          </Alert>
        ) : null}
        {state === "done" ? (
          <Alert>
            <AlertTitle>{copy.paid}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {state === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>{copy.payNow}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
