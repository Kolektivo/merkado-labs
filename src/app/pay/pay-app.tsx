"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { CopyValue } from "@/components/copy-value";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createMockPaymentProvider } from "@/lib/pay/mock-provider";
import { PAYER_UNCHANGED_BY_LOCALE, payerCopy } from "@/lib/rent-advance/copy";
import { confirmPaymentAction } from "@/lib/rent-advance/actions";
import { formatUsdcAtomic, formatUsdcAtomicAmount, formatXcg } from "@/lib/rent-advance/money";
import { truncateHash } from "@/lib/rent-advance/ids";
import type { PaymentRequestStatus } from "@/lib/rent-advance/types";

import { LanguageToggle, usePayerLocale } from "./payer-locale";

type HistoryRow = {
  paymentRequestId: string;
  periodLabel: string;
  status: PaymentRequestStatus;
  amountUsdcAtomic: number;
  amountXcgCents: number;
  dueDateLabel: string;
};

type WalletUi =
  | "disconnected"
  | "connecting"
  | "connected"
  | "awaiting"
  | "pending"
  | "success"
  | "failed"
  | "partial";

function historyStatusLabel(
  status: PaymentRequestStatus,
  copy: (typeof payerCopy)[keyof typeof payerCopy],
) {
  if (status === "confirmed") return copy.paid;
  if (status === "pending" || status === "initiated") return copy.pending;
  if (status === "failed") return copy.failed;
  if (status === "partial") return copy.partial;
  if (status === "overdue") return copy.overdue;
  if (status === "expired") return copy.expired;
  return copy.dueStatus;
}

export function PayApp({
  paymentRequestId,
  periodLabel,
  dueDateLabel,
  amountUsdcAtomic,
  amountXcgCents,
  paymentReference,
  receivingAddress,
  networkLabel,
  status,
  txHash,
  propertyLabel,
  district,
  earlierPeriodLabel,
  history,
}: {
  paymentRequestId: string;
  periodLabel: string;
  dueDateLabel: string;
  amountUsdcAtomic: number;
  amountXcgCents: number;
  paymentReference: string;
  receivingAddress: string;
  networkLabel: string;
  status: PaymentRequestStatus;
  txHash: string | null;
  propertyLabel: string;
  district: string;
  earlierPeriodLabel: string | null;
  history: HistoryRow[];
}) {
  const { copy, locale } = usePayerLocale();
  const router = useRouter();
  const provider = useMemo(() => createMockPaymentProvider(), []);
  const [wallet, setWallet] = useState<WalletUi>(
    status === "confirmed"
      ? "success"
      : status === "pending"
        ? "pending"
        : status === "failed"
          ? "failed"
          : status === "partial"
            ? "partial"
            : "disconnected",
  );
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulate, setSimulate] = useState<"ok" | "failed" | "partial">("ok");

  const locked = status === "confirmed" || wallet === "success";
  const overdue = status === "overdue";
  const expired = status === "expired";

  async function connect() {
    setWallet("connecting");
    setError(null);
    try {
      const session = await provider.connect();
      setAddress(session.address);
      setWallet("connected");
    } catch {
      setWallet("disconnected");
      setError("The demo wallet could not connect. Try again.");
    }
  }

  async function pay() {
    setError(null);
    if (!address) {
      try {
        const session = await provider.connect();
        setAddress(session.address);
      } catch {
        setWallet("disconnected");
        setError("The demo wallet could not connect. Try again.");
        return;
      }
    }
    setWallet("awaiting");
    const submitted = await provider.submitPayment({
      paymentRequestId,
      expectedAtomicAmount: amountUsdcAtomic,
      recipient: receivingAddress,
      offerReference: paymentReference,
      receivableId: paymentRequestId,
    });
    try {
      if (simulate === "failed" || submitted.errorCode === "mock_failed") {
        await confirmPaymentAction(paymentRequestId, "failed");
        setWallet("failed");
        setError(copy.failed);
        return;
      }
      if (simulate === "partial" || submitted.errorCode === "amount_mismatch") {
        await confirmPaymentAction(paymentRequestId, "partial");
        setWallet("partial");
        setError(copy.partial);
        return;
      }
      setWallet("pending");
      await confirmPaymentAction(paymentRequestId, "pending");
      await confirmPaymentAction(paymentRequestId, "confirmed");
      setWallet("success");
      router.refresh();
    } catch (err) {
      setWallet("failed");
      setError(
        err instanceof Error
          ? err.message
          : "The payment could not be saved. Nothing was recorded.",
      );
    }
  }

  const blockedByEarlier = Boolean(earlierPeriodLabel) && !locked && !expired;

  return (
    <div className="space-y-6">
      <LanguageToggle />
      <div>
        <p className="text-sm text-muted-foreground">{copy.greeting}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {locked ? copy.successTitle : copy.allSet}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.unchanged}</p>
      </div>

      <p className="rounded-xl border border-dashed px-3 py-2 text-xs" role="note">
        {copy.demoOnly}
      </p>

      <Card>
        <CardContent className="space-y-1 pt-6">
          <p className="font-medium">{propertyLabel}</p>
          <p className="text-sm text-muted-foreground">
            {[district.trim(), "Curaçao"].filter(Boolean).join(", ")}
          </p>
        </CardContent>
      </Card>

      <div aria-live="polite" className="space-y-3">
        {locked ? (
          <Alert>
            <AlertTitle>{copy.successTitle}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{copy.successBody}</p>
              <p className="text-2xl font-semibold">{formatUsdcAtomic(amountUsdcAtomic)}</p>
              <p>{formatXcg(amountXcgCents)} · {periodLabel}</p>
              <p>
                {copy.reference} {paymentReference}
              </p>
              {txHash ? (
                <p>
                  {copy.txRef} {truncateHash(txHash)}
                </p>
              ) : null}
              <Button asChild variant="outline">
                <Link href="/account/payments">{copy.myPayments}</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : expired ? (
          <Alert variant="destructive">
            <AlertTitle>{copy.expired}</AlertTitle>
          </Alert>
        ) : blockedByEarlier ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-sm text-muted-foreground">{periodLabel}</p>
              <p className="text-3xl font-semibold tabular-nums">
                {formatUsdcAtomic(amountUsdcAtomic)}
              </p>
              <p className="text-sm">{formatXcg(amountXcgCents)}</p>
              <Alert>
                <AlertTitle>
                  {copy.payEarlierFirst.replace("{period}", earlierPeriodLabel ?? "")}
                </AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{copy.payEarlierBody}</p>
                  <Button asChild className="min-h-11">
                    <Link href="/pay">{copy.openNextPayment}</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-4 pt-6">
              {overdue ? (
                <Alert variant="destructive">
                  <AlertTitle>{copy.overdue}</AlertTitle>
                  <AlertDescription>{dueDateLabel}</AlertDescription>
                </Alert>
              ) : null}
              <p className="text-sm text-muted-foreground">{periodLabel}</p>
              <p className="text-3xl font-semibold tabular-nums">
                {formatUsdcAtomic(amountUsdcAtomic)}
              </p>
              <p className="text-sm">{formatXcg(amountXcgCents)}</p>
              <p className="text-sm">
                {copy.due} {dueDateLabel}
              </p>
              <p className="text-sm">
                {copy.reference} {paymentReference}
              </p>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">{copy.receiving}</p>
                <CopyValue value={receivingAddress} label={copy.receiving} truncate />
                <CopyValue
                  value={formatUsdcAtomicAmount(amountUsdcAtomic)}
                  label={copy.copyAmount}
                />
              </div>
              <p className="text-sm">
                {copy.network}: {networkLabel || copy.networkUnset}
              </p>
              <p className="text-xs text-muted-foreground">{copy.memoNote}</p>
              {wallet === "disconnected" || wallet === "connecting" ? (
                <Button type="button" className="min-h-11" onClick={() => void connect()}>
                  {wallet === "connecting" ? copy.connecting : copy.connectWallet}
                </Button>
              ) : null}
              {wallet === "connected" ||
              wallet === "failed" ||
              wallet === "partial" ||
              wallet === "pending" ? (
                <div className="space-y-2">
                  {wallet === "pending" ? <p>{copy.pending}</p> : null}
                  {address ? (
                    <p className="text-sm">
                      {copy.connected} · {truncateHash(address)}
                    </p>
                  ) : null}
                  <label className="block text-xs text-muted-foreground">
                    Demo outcome
                    <select
                      className="mt-1 h-10 w-full rounded-xl border px-3"
                      value={simulate}
                      onChange={(event) =>
                        setSimulate(event.target.value as "ok" | "failed" | "partial")
                      }
                    >
                      <option value="ok">Success</option>
                      <option value="failed">Failed</option>
                      <option value="partial">Incorrect amount</option>
                    </select>
                  </label>
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={() => void pay()}
                  >
                    {wallet === "failed" || wallet === "partial" || wallet === "pending"
                      ? copy.retry
                      : copy.confirmPay}
                  </Button>
                </div>
              ) : null}
              {wallet === "awaiting" ? <p>{copy.awaiting}</p> : null}
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>{copy.failed}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>

      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">{copy.whatDoesNotChange}</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {PAYER_UNCHANGED_BY_LOCALE[locale].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>

      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">{copy.historyLink}</summary>
        <div className="mt-3 space-y-2 text-sm">
          {history.length === 0 ? (
            <p className="text-muted-foreground">{copy.noPaymentsYet}</p>
          ) : (
            history.map((row) => (
              <Link
                key={row.paymentRequestId}
                href={`/pay/${row.paymentRequestId}`}
                className="block rounded-lg border px-3 py-2"
              >
                {row.periodLabel} · {formatUsdcAtomic(row.amountUsdcAtomic)} ·{" "}
                {historyStatusLabel(row.status, copy)}
              </Link>
            ))
          )}
        </div>
      </details>
    </div>
  );
}
