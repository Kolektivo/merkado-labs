"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { CopyValue } from "@/components/copy-value";
import { HelpTip } from "@/components/help-tip";
import { SentooMark } from "@/components/sentoo-mark";
import { StatusBadge } from "@/components/status-badge";
import { UsdcMark } from "@/components/usdc-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPaymentProvider } from "@/lib/pay/create-provider";
import { isTestnetConfig } from "@/lib/pay/networks";
import type { SubmittedPayment } from "@/lib/pay/provider";
import {
  applyPaymentRailCopy,
  payerCopy,
  type PayerCopy,
} from "@/lib/rent-advance/copy";
import { confirmPaymentAction } from "@/lib/rent-advance/actions";
import { formatUsdcAtomic, formatUsdcAtomicAmount, formatXcg } from "@/lib/rent-advance/money";
import { truncateHash } from "@/lib/rent-advance/ids";
import type {
  PaymentRequestStatus,
  PublicCryptoConfig,
} from "@/lib/rent-advance/types";

import { cn } from "@/lib/utils";

import { usePayerLocale } from "./payer-locale";

type HistoryRow = {
  paymentRequestId: string;
  offerReference: string;
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

function PaymentMethodPanel({
  expanded,
  onExpand,
  title,
  compactTitle,
  compactHint,
  mark,
  badge,
  children,
}: {
  expanded: boolean;
  onExpand: () => void;
  title: string;
  compactTitle: string;
  compactHint: string;
  mark?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      aria-label={title}
      className={cn(
        "overflow-hidden rounded-2xl border transition-[border-color,background-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
        expanded
          ? "border-primary/25 bg-muted/20 shadow-sm"
          : "border-border bg-transparent",
      )}
    >
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 text-left transition-colors duration-300 ease-out motion-reduce:transition-none",
          expanded ? "cursor-default pt-4 pb-0" : "min-h-11 py-2.5 hover:bg-muted/40",
        )}
        aria-expanded={expanded}
        onClick={() => {
          if (!expanded) onExpand();
        }}
      >
        {mark}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "flex items-center gap-2 transition-[font-size,line-height] duration-300 ease-out motion-reduce:transition-none",
              expanded ? "text-lg font-semibold" : "text-sm font-medium",
            )}
          >
            {compactTitle}
            {badge ? (
              <span
                className={cn(
                  "overflow-hidden transition-[max-width,opacity] duration-300 ease-out motion-reduce:transition-none",
                  expanded
                    ? "max-w-40 opacity-100"
                    : "pointer-events-none max-w-0 opacity-0",
                )}
              >
                {badge}
              </span>
            ) : null}
          </span>
          <span
            aria-hidden={expanded}
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
              expanded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
            )}
          >
            <span className="overflow-hidden text-xs text-muted-foreground">
              {compactHint}
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out motion-reduce:transition-none",
            expanded ? "rotate-180 opacity-0" : "rotate-0 opacity-100",
          )}
          aria-hidden
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div
          className="min-h-0 overflow-hidden"
          aria-hidden={!expanded}
          {...(!expanded ? { inert: true } : {})}
        >
          <div
            className={cn(
              "px-4 pb-4 pt-3 transition-opacity duration-300 ease-out motion-reduce:transition-none",
              expanded ? "opacity-100 delay-75" : "opacity-0",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function SentooPreview() {
  const [accountHolder, setAccountHolder] = useState("");
  const [bankAccount, setBankAccount] = useState("");

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Visual preview only. Details stay in this browser field and are never
        saved or sent. Use fictional information.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sentoo-account-holder">Account holder</Label>
          <Input
            id="sentoo-account-holder"
            autoComplete="off"
            value={accountHolder}
            onChange={(event) => setAccountHolder(event.target.value)}
            placeholder="Demo Renter"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sentoo-bank-account">Bank account</Label>
          <Input
            id="sentoo-bank-account"
            autoComplete="off"
            value={bankAccount}
            onChange={(event) => setBankAccount(event.target.value)}
            placeholder="DEMO-0000"
          />
        </div>
      </div>
      <Button type="button" className="min-h-11 w-full" disabled>
        Sentoo payments coming soon
      </Button>
    </div>
  );
}

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
  cryptoConfig?: PublicCryptoConfig | null;
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paymentRail, setPaymentRail] = useState<"stablecoin" | "sentoo">(
    "stablecoin",
  );

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
  const qrValue = `merkado-demo:pay?address=${encodeURIComponent(receivingAddress)}&amount=${encodeURIComponent(formatUsdcAtomicAmount(amountUsdcAtomic))}&reference=${encodeURIComponent(paymentReference)}`;

  async function settle(submitted: SubmittedPayment) {
    const meta = {
      txHash: submitted.txHash,
    };
    if (submitted.errorCode === "amount_mismatch") {
      await confirmPaymentAction(paymentRequestId, "partial", meta);
      setWallet("partial");
      setError(copy.partial);
      return;
    }
    if (submitted.errorCode === "mock_failed" || submitted.status === "failed") {
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
              <div>
                <p className="text-3xl font-semibold tabular-nums">
                  {formatXcg(amountXcgCents)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Settles as {formatUsdcAtomic(amountUsdcAtomic)} · {periodLabel}
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
              <div>
                <p className="text-3xl font-semibold tabular-nums">
                  {formatXcg(amountXcgCents)}
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

              <div>
                <p className="flex items-center gap-1.5 text-3xl font-semibold tabular-nums leading-none">
                  {formatXcg(amountXcgCents)}
                  <HelpTip label="XCG">
                    Caribbean guilders. Settlement is {formatUsdcAtomic(amountUsdcAtomic)}.
                  </HelpTip>
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UsdcMark size={16} />
                  Settles as {formatUsdcAtomic(amountUsdcAtomic)}
                </p>
              </div>

              <p className="text-sm">
                {copy.due} {dueDateLabel}
              </p>

              <div className="flex flex-col gap-3" aria-label="Payment method">
                <PaymentMethodPanel
                  expanded={paymentRail === "stablecoin"}
                  onExpand={() => setPaymentRail("stablecoin")}
                  title="Pay with stablecoin"
                  compactTitle="Pay with stablecoin"
                  compactHint="USDC · QR and copy details"
                >
                  <div className="flex flex-col gap-4">
                    {wallet === "pending" || wallet === "awaiting" ? (
                      <Alert>
                        <AlertTitle>
                          {wallet === "awaiting" ? copy.awaiting : copy.pending}
                        </AlertTitle>
                      </Alert>
                    ) : null}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">{copy.reference}</span>
                        <span className="font-medium">{paymentReference}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          {copy.network}
                          <HelpTip label={copy.network}>{copy.networkTip}</HelpTip>
                        </span>
                        <span className="font-medium">
                          {networkLabel || copy.networkUnset}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <p className="text-sm text-muted-foreground">{copy.receiving}</p>
                        <CopyValue
                          value={receivingAddress}
                          label={copy.copyAddress}
                          truncate
                        />
                      </div>
                      <div className="flex flex-col items-center gap-2 rounded-lg bg-white p-4 text-center">
                        <QRCodeSVG
                          value={qrValue}
                          size={152}
                          level="M"
                          marginSize={2}
                          title={`Stablecoin payment QR for ${paymentReference}`}
                        />
                        <p className="text-xs text-muted-foreground">
                          Demo information QR only. It contains the fictional
                          offer address, amount, and reference; it cannot open a
                          real wallet.
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <p className="text-sm text-muted-foreground">{copy.copyAmount}</p>
                        <CopyValue
                          value={formatUsdcAtomicAmount(amountUsdcAtomic)}
                          label={copy.copyAmount}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="min-h-11 w-full"
                      disabled={inFlight}
                      onClick={() => void reportSent()}
                    >
                      {copy.iveSentPayment}
                    </Button>
                    {error ? (
                      <Alert variant="destructive">
                        <AlertTitle>{copy.failed}</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    ) : null}
                  </div>
                </PaymentMethodPanel>

                <PaymentMethodPanel
                  expanded={paymentRail === "sentoo"}
                  onExpand={() => setPaymentRail("sentoo")}
                  title="Pay with Sentoo"
                  compactTitle="Continue with Sentoo"
                  compactHint="Bank payment · Coming soon"
                  mark={<SentooMark expanded={paymentRail === "sentoo"} />}
                  badge={
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                      Coming soon
                    </span>
                  }
                >
                  <SentooPreview />
                </PaymentMethodPanel>
              </div>
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
                        {row.offerReference} · {historyStatusLabel(row.status, copy)}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatXcg(row.amountXcgCents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground" role="note">
        {copy.demoOnly}
      </p>
    </div>
  );
}
