"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { CopyValue } from "@/components/copy-value";
import { HelpTip } from "@/components/help-tip";
import { StatusBadge } from "@/components/status-badge";
import { UsdcMark } from "@/components/usdc-mark";
import { SentooMark } from "@/components/sentoo-mark";
import { WalletConnection } from "@/components/wallet-connection";
import { ApproveThenSendDialog } from "@/components/rent-advance/approve-then-send-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/pay/networks";
import { approveUsdc, depositRent } from "@/lib/pay/wallet-adapter";
import {
  attachSubmittedTxAction,
  checkPendingPaymentAction,
  createRentPaymentAttemptAction,
  verifyRentPaymentAction,
} from "@/lib/rent-advance/actions";
import { payerCopy, type PayerCopy } from "@/lib/rent-advance/copy";
import { formatUsdcAtomic, formatUsdcAtomicAmount, formatXcg } from "@/lib/rent-advance/money";
import { truncateHash } from "@/lib/rent-advance/ids";
import type { PaymentRequestStatus } from "@/lib/rent-advance/types";

import { cn } from "@/lib/utils";

import { usePayerLocale } from "./payer-locale";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type HistoryRow = {
  paymentRequestId: string;
  offerReference: string;
  periodLabel: string;
  status: PaymentRequestStatus;
  amountUsdcAtomic: number;
  amountXcgCents: number;
  dueDateLabel: string;
  upcoming: boolean;
};

type WalletUi =
  | "disconnected"
  | "connected"
  | "pending"
  | "confirmed"
  | "failed"
  | "reverted";

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

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



function historyStatusLabel(
  status: PaymentRequestStatus,
  copy: PayerCopy,
  upcoming = false,
) {
  if (status === "confirmed") return copy.paid;
  if (status === "pending" || status === "initiated") return copy.pending;
  if (status === "failed") return copy.failed;
  if (status === "partial") return copy.partial;
  if (status === "overdue") return copy.overdue;
  if (status === "expired") return copy.expired;
  return upcoming ? copy.scheduled : copy.dueStatus;
}

function statusTone(
  status: PaymentRequestStatus,
  wallet: WalletUi,
): "success" | "warning" | "error" | "info" | "neutral" {
  if (status === "confirmed" || wallet === "confirmed") return "success";
  if (wallet === "pending" || status === "pending") return "info";
  if (wallet === "failed" || wallet === "reverted" || status === "failed" || status === "expired") {
    return "error";
  }
  if (status === "overdue" || status === "partial") return "warning";
  return "neutral";
}

function isUserSafeConfigError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;
  return (
    name === "MerkadoConfigurationError" ||
    (typeof message === "string" && message.includes("NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS"))
  );
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
  configured,
  minted,
  tokenId,
  contractAddress,
  pendingRecovery,
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
  configured: boolean;
  minted: boolean;
  tokenId: number | null;
  contractAddress: string | null;
  pendingRecovery: boolean;
}) {
  const { locale } = usePayerLocale();
  const copy = useMemo(() => payerCopy[locale], [locale]);
  const router = useRouter();
  const wallet = useMerkadoWallet();
  const [walletUi, setWalletUi] = useState<WalletUi>(
    status === "confirmed"
      ? "confirmed"
      : status === "failed"
        ? "failed"
        : status === "pending"
          ? "pending"
          : "disconnected",
  );
  const [connected, setConnected] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentRail, setPaymentRail] = useState<"stablecoin" | "sentoo">("stablecoin");

  const locked = status === "confirmed" || walletUi === "confirmed";
  const overdue = status === "overdue";
  const expired = status === "expired";
  const onBaseSepolia = wallet.chainId === BASE_SEPOLIA_CHAIN_ID;

  const blockedByEarlier = Boolean(earlierPeriodLabel) && !locked && !expired;

  const qrValue = `merkado-demo:pay?address=${encodeURIComponent(receivingAddress)}&amount=${encodeURIComponent(formatUsdcAtomicAmount(amountUsdcAtomic))}&reference=${encodeURIComponent(paymentReference)}`;

  async function runApprove() {
    await approveUsdc(wallet, BigInt(amountUsdcAtomic), contractAddress);
  }

  async function runSend() {
    let hash: string | null = null;
    try {
      const attempt = await createRentPaymentAttemptAction(paymentRequestId);
      const paymentId = attempt.opaquePaymentId as `0x${string}`;
      const amountAtomic = BigInt(amountUsdcAtomic);
      const { hash: txHash } = await depositRent(
        wallet,
        {
          tokenId: BigInt(tokenId ?? 0),
          paymentId,
          amountAtomic,
        },
        contractAddress,
      );
      hash = txHash;
      await attachSubmittedTxAction(
        paymentRequestId,
        txHash,
        wallet.address ?? "0x0000000000000000000000000000000000000000",
      );
      setWalletUi("pending");
      let result = await verifyRentPaymentAction(
        paymentRequestId,
        txHash,
        wallet.address ?? "0x0000000000000000000000000000000000000000",
      );
      let attempts = 0;
      while (result.status === "pending" && attempts < 5) {
        await wait(4000);
        result = await verifyRentPaymentAction(
          paymentRequestId,
          txHash,
          wallet.address ?? "0x0000000000000000000000000000000000000000",
        );
        attempts += 1;
      }
      if (result.status === "confirmed") {
        return { status: "confirmed" as const };
      }
      return {
        status: "pending" as const,
        reason: result.reason ?? copy.awaiting,
      };
    } catch (err) {
      if (isUserSafeConfigError(err)) {
        throw new Error(copy.notConfiguredBody);
      }
      if (hash) {
        return {
          status: "pending" as const,
          reason: err instanceof Error ? err.message : copy.awaiting,
        };
      }
      throw err;
    }
  }

  async function runCheckStatus() {
    const result = await checkPendingPaymentAction(paymentRequestId);
    if (result.status === "confirmed") return { status: "confirmed" as const };
    return {
      status: "pending" as const,
      reason: result.reason ?? copy.awaiting,
    };
  }

  function onConfirmed() {
    setWalletUi("confirmed");
    router.refresh();
  }

  async function handleCheckStatus() {
    setError(null);
    setBusy(true);
    try {
      const result = await checkPendingPaymentAction(paymentRequestId);
      if (result.status === "confirmed") {
        setWalletUi("confirmed");
        router.refresh();
      } else {
        setWalletUi("pending");
        setError(result.reason ?? copy.awaiting);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check the payment status.");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = historyStatusLabel(
    walletUi === "confirmed" ? "confirmed" : walletUi === "pending" ? "pending" : status,
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
        {!configured ? (
          <Alert variant="destructive">
            <AlertTitle>{copy.notConfiguredTitle}</AlertTitle>
            <AlertDescription>{copy.notConfiguredBody}</AlertDescription>
          </Alert>
        ) : locked ? (
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
        ) : !minted ? (
          <Alert>
            <AlertTitle>{copy.notMinted}</AlertTitle>
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
                <StatusBadge tone={statusTone(status, walletUi)}>{statusLabel}</StatusBadge>
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

              <p className="text-sm">{copy.due} {dueDateLabel}</p>

              <div className="flex flex-col gap-3" aria-label="Payment method">
                <PaymentMethodPanel
                  expanded={paymentRail === "stablecoin"}
                  onExpand={() => setPaymentRail("stablecoin")}
                  title="Pay with stablecoin"
                  compactTitle={copy.payByStablecoinTitle}
                  compactHint="USDC · QR and copy details"
                >
                  <div className="flex flex-col gap-4">
                    {walletUi === "pending" ? (
                      <Alert>
                        <AlertTitle>{copy.pending}</AlertTitle>
                        <AlertDescription>{copy.awaiting}</AlertDescription>
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
                        <span className="font-medium">{networkLabel || copy.networkUnset}</span>
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
                          Informational QR only. Use Pay rent below to submit
                          your payment.
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

                    <WalletConnection onConnectedChange={setConnected} />

                    {connected && onBaseSepolia ? (
                      <Button
                        type="button"
                        className="min-h-11 w-full"
                        onClick={() => setDialogOpen(true)}
                      >
                        {copy.confirmPay}
                      </Button>
                    ) : null}

                    {pendingRecovery ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 w-full"
                        disabled={busy}
                        onClick={() => void handleCheckStatus()}
                      >
                        {busy ? "Checking…" : "Check payment status"}
                      </Button>
                    ) : null}

                    {error ? (
                      <Alert variant="destructive">
                        <AlertTitle>
                          {walletUi === "reverted" ? copy.reverted : copy.failed}
                        </AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    ) : null}
                  </div>
                </PaymentMethodPanel>

                <PaymentMethodPanel
                  expanded={paymentRail === "sentoo"}
                  onExpand={() => setPaymentRail("sentoo")}
                  title="Continue with Sentoo"
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
                        {row.offerReference} · {historyStatusLabel(row.status, copy, row.upcoming)}
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
        {copy.memoNote}
      </p>

      <ApproveThenSendDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={copy.payThisMonth}
        description={`${formatUsdcAtomic(amountUsdcAtomic)} · ${networkLabel || copy.networkUnset}`}
        confirmLabel={`${copy.approveUsdc} & ${copy.confirmPay}`}
        sendLabel={copy.confirmPay}
        needsApproval
        summary={
          <div className="rounded-xl bg-muted/40 p-4 text-sm">
            <p className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{copy.reference}</span>
              <span className="font-medium">{paymentReference}</span>
            </p>
            <p className="mt-1 flex items-center justify-between gap-2">
              <span className="text-muted-foreground">USDC</span>
              <span className="font-medium tabular-nums">{formatUsdcAtomic(amountUsdcAtomic)}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {copy.payByWalletBody}
            </p>
          </div>
        }
        runApprove={runApprove}
        runSend={runSend}
        runCheckStatus={runCheckStatus}
        onConfirmed={onConfirmed}
      />
    </div>
  );
}