"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { CopyValue } from "@/components/copy-value";
import { HelpTip } from "@/components/help-tip";
import { StatusBadge } from "@/components/status-badge";
import { UsdcMark } from "@/components/usdc-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createPaymentProvider } from "@/lib/pay/create-provider";
import { isTestnetConfig } from "@/lib/pay/networks";
import { showDemoPaymentOutcomes, walletConnectError } from "@/lib/pay/mode";
import type { SubmittedPayment } from "@/lib/pay/provider";
import {
  applyPaymentRailCopy,
  PAYER_UNCHANGED,
  payerCopy,
  type PayerCopy,
} from "@/lib/rent-advance/copy";
import { confirmPaymentAction } from "@/lib/rent-advance/actions";
import { formatUsd, formatUsdcAtomic, formatUsdcAtomicAmount } from "@/lib/rent-advance/money";
import { truncateHash } from "@/lib/rent-advance/ids";
import type { CryptoConfig, PaymentRequestStatus } from "@/lib/rent-advance/types";

import { usePayerLocale } from "./payer-locale";

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

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function historyStatusLabel(
  status: PaymentRequestStatus,
  copy: PayerCopy,
) {
  if (status === "confirmed") return copy.paid;
  if (status === "pending" || status === "initiated") return copy.pending;
  if (status === "failed") return copy.failed;
  if (status === "partial") return copy.partial;
  if (status === "overdue") return copy.overdue;
  if (status === "expired") return copy.expired;
  return copy.dueStatus;
}

function statusTone(
  status: PaymentRequestStatus,
  wallet: WalletUi,
): "success" | "warning" | "error" | "info" | "neutral" {
  if (status === "confirmed" || wallet === "success") return "success";
  if (wallet === "pending" || wallet === "awaiting" || status === "pending") return "info";
  if (wallet === "failed" || status === "failed" || status === "expired") return "error";
  if (wallet === "partial" || status === "partial" || status === "overdue") return "warning";
  return "neutral";
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
  cryptoConfig,
  offerReference,
  receivableId,
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
  cryptoConfig?: CryptoConfig | null;
  offerReference: string;
  receivableId: string;
}) {
  const { locale } = usePayerLocale();
  const copy = useMemo(
    () =>
      applyPaymentRailCopy(payerCopy[locale], {
        locale,
        isTestnet: isTestnetConfig(cryptoConfig),
        networkLabel: cryptoConfig?.networkLabel,
      }),
    [locale, cryptoConfig],
  );
  const router = useRouter();
  const provider = useMemo(() => createPaymentProvider(cryptoConfig), [cryptoConfig]);
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
  const [busy, setBusy] = useState(false);

  const locked = status === "confirmed" || wallet === "success";
  const overdue = status === "overdue";
  const expired = status === "expired";
  const inFlight = wallet === "awaiting" || wallet === "pending" || busy;

  const submitInput = {
    paymentRequestId,
    expectedAtomicAmount: amountUsdcAtomic,
    recipient: receivingAddress,
    offerReference,
    receivableId,
  };

  async function connect() {
    setWallet("connecting");
    setError(null);
    try {
      const session = await provider.connect();
      setAddress(session.address);
      setWallet("connected");
    } catch {
      setWallet("disconnected");
      setError(walletConnectError());
    }
  }

  async function settle(submitted: SubmittedPayment) {
    const meta = {
      txHash: submitted.txHash,
    };
    if (simulate === "partial" || submitted.errorCode === "amount_mismatch") {
      await confirmPaymentAction(paymentRequestId, "partial", meta);
      setWallet("partial");
      setError(copy.partial);
      return;
    }
    if (
      simulate === "failed" ||
      submitted.errorCode === "mock_failed" ||
      submitted.status === "failed"
    ) {
      await confirmPaymentAction(paymentRequestId, "failed", meta);
      setWallet("failed");
      setError(submitted.errorMessage ?? copy.failed);
      return;
    }
    setWallet("pending");
    await confirmPaymentAction(paymentRequestId, "pending", meta);
    await wait(1400);
    await confirmPaymentAction(paymentRequestId, "confirmed", meta);
    setWallet("success");
    router.refresh();
  }

  async function payWithWallet() {
    setError(null);
    setBusy(true);
    try {
      if (!address) {
        const session = await provider.connect();
        setAddress(session.address);
      }
      setWallet("awaiting");
      const submitted = await provider.submitPayment({
        ...submitInput,
        method: "wallet",
      });
      await settle(submitted);
    } catch (err) {
      setWallet("failed");
      setError(
        err instanceof Error
          ? err.message
          : "The payment could not be saved. Nothing was recorded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reportSent() {
    setError(null);
    setBusy(true);
    setWallet("pending");
    try {
      const submitted = await provider.reportExternalTransfer({
        ...submitInput,
        method: "external",
      });
      await settle(submitted);
    } catch (err) {
      setWallet("failed");
      setError(
        err instanceof Error
          ? err.message
          : "The payment could not be saved. Nothing was recorded.",
      );
    } finally {
      setBusy(false);
    }
  }

  const blockedByEarlier = Boolean(earlierPeriodLabel) && !locked && !expired;
  const statusLabel = historyStatusLabel(
    wallet === "success" ? "confirmed" : wallet === "pending" ? "pending" : status,
    copy,
  );

  const place = [district.trim(), "Curaçao"].filter(Boolean).join(", ");

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {locked ? copy.successTitle : copy.payThisMonth}
        </h1>
        <p className="text-sm text-muted-foreground">
          {propertyLabel}
          {place ? ` · ${place}` : ""}
        </p>
      </div>

      <div aria-live="polite" className="space-y-4">
        {locked ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <StatusBadge tone="success">{copy.paid}</StatusBadge>
              <div className="flex items-center gap-3">
                <UsdcMark size={32} />
                <p className="text-3xl font-semibold tabular-nums">
                  {formatUsdcAtomic(amountUsdcAtomic)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {copy.sameAsRent.replace("{amount}", formatUsd(amountXcgCents))} ·{" "}
                {periodLabel}
              </p>
              <p className="text-sm">
                {copy.reference} {paymentReference}
              </p>
              {txHash ? (
                <p className="text-sm text-muted-foreground">
                  {copy.txRef} {truncateHash(txHash)}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : expired ? (
          <Alert variant="destructive">
            <AlertTitle>{copy.expired}</AlertTitle>
          </Alert>
        ) : blockedByEarlier ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-3">
                <UsdcMark size={32} />
                <p className="text-3xl font-semibold tabular-nums">
                  {formatUsdcAtomic(amountUsdcAtomic)}
                </p>
              </div>
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
            <CardContent className="space-y-5 pt-6">
              {overdue ? (
                <Alert variant="destructive">
                  <AlertTitle>{copy.overdue}</AlertTitle>
                  <AlertDescription>{dueDateLabel}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={statusTone(status, wallet)}>{statusLabel}</StatusBadge>
                <p className="text-sm text-muted-foreground">{periodLabel}</p>
              </div>

              <div className="flex items-center gap-3">
                <UsdcMark size={36} />
                <div>
                  <p className="flex items-center gap-1.5 text-3xl font-semibold tabular-nums leading-none">
                    {formatUsdcAtomic(amountUsdcAtomic)}
                    <HelpTip label="USDC">{copy.usdcTip}</HelpTip>
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {copy.sameAsRent.replace("{amount}", formatUsd(amountXcgCents))}
                  </p>
                </div>
              </div>

              <p className="text-sm">
                {copy.due} {dueDateLabel}
              </p>

              {wallet === "pending" || wallet === "awaiting" ? (
                <Alert>
                  <AlertTitle>{wallet === "awaiting" ? copy.awaiting : copy.pending}</AlertTitle>
                </Alert>
              ) : null}

              <div className="space-y-3 rounded-xl bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{copy.reference}</span>
                  <span className="font-medium">{paymentReference}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {copy.network}
                    <HelpTip label={copy.network}>{copy.networkTip}</HelpTip>
                  </span>
                  <span className="font-medium">{networkLabel || copy.networkUnset}</span>
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm text-muted-foreground">{copy.receiving}</p>
                  <CopyValue value={receivingAddress} label={copy.copyAddress} truncate />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm text-muted-foreground">{copy.copyAmount}</p>
                  <CopyValue
                    value={formatUsdcAtomicAmount(amountUsdcAtomic)}
                    label={copy.copyAmount}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Button
                  type="button"
                  className="min-h-11 w-full"
                  disabled={inFlight}
                  onClick={() => void reportSent()}
                >
                  {copy.iveSentPayment}
                </Button>
                {wallet === "disconnected" || wallet === "connecting" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={inFlight}
                    onClick={() => void connect()}
                  >
                    {wallet === "connecting" ? copy.connecting : copy.connectWallet}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={inFlight}
                    onClick={() => void payWithWallet()}
                  >
                    {wallet === "failed" || wallet === "partial"
                      ? copy.retry
                      : copy.confirmPay}
                  </Button>
                )}
                {address ? (
                  <p className="text-center text-xs text-muted-foreground">
                    {copy.connected} · {truncateHash(address)}
                  </p>
                ) : null}
              </div>

              {showDemoPaymentOutcomes() ? (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">{copy.demoOutcomes}</summary>
                  <select
                    className="mt-2 h-10 w-full rounded-xl border bg-background px-3"
                    value={simulate}
                    onChange={(event) =>
                      setSimulate(event.target.value as "ok" | "failed" | "partial")
                    }
                  >
                    <option value="ok">Success</option>
                    <option value="failed">Failed</option>
                    <option value="partial">Incorrect amount</option>
                  </select>
                </details>
              ) : null}

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

      <Card id="payment-history">
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-sm font-semibold">{copy.historyLink}</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.noPaymentsYet}</p>
          ) : (
            <ul className="divide-y">
              {history.map((row) => (
                <li key={row.paymentRequestId}>
                  <Link
                    href={`/pay/${row.paymentRequestId}`}
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <span>
                      <span className="font-medium">{row.periodLabel}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {historyStatusLabel(row.status, copy)}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatUsdcAtomic(row.amountUsdcAtomic)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <details className="rounded-xl border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">{copy.whatDoesNotChange}</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {PAYER_UNCHANGED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>

      <p className="text-center text-xs text-muted-foreground" role="note">
        {copy.demoOnly}
      </p>
    </div>
  );
}
