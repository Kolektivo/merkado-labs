"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { HelpTip } from "@/components/help-tip";
import { StatusBadge } from "@/components/status-badge";
import { UsdcMark } from "@/components/usdc-mark";
import { WalletConnection } from "@/components/wallet-connection";
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
import { formatUsdcAtomic, formatXcg } from "@/lib/rent-advance/money";
import { truncateHash } from "@/lib/rent-advance/ids";
import type { PaymentRequestStatus } from "@/lib/rent-advance/types";

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

function historyStatusLabel(status: PaymentRequestStatus, copy: PayerCopy) {
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
  pendingRecovery,
}: {
  paymentRequestId: string;
  periodLabel: string;
  dueDateLabel: string;
  amountUsdcAtomic: number;
  amountXcgCents: number;
  paymentReference: string;
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
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = status === "confirmed" || walletUi === "confirmed";
  const overdue = status === "overdue";
  const expired = status === "expired";
  const inFlight = walletUi === "pending" || busy;
  const onBaseSepolia = wallet.chainId === BASE_SEPOLIA_CHAIN_ID;

  const blockedByEarlier = Boolean(earlierPeriodLabel) && !locked && !expired;

  async function handleApprove() {
    setError(null);
    setBusy(true);
    try {
      await approveUsdc(wallet, BigInt(amountUsdcAtomic));
      setApproved(true);
    } catch (err) {
      setWalletUi("failed");
      setError(err instanceof Error ? err.message : "The approval did not go through.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePay() {
    setError(null);
    setBusy(true);
    setApproved(false);
    try {
      const attempt = await createRentPaymentAttemptAction(paymentRequestId);
      const paymentId = attempt.opaquePaymentId as `0x${string}`;
      const amountAtomic = BigInt(amountUsdcAtomic);
      const { hash } = await depositRent(wallet, {
        tokenId: BigInt(tokenId ?? 0),
        paymentId,
        amountAtomic,
      });
      await attachSubmittedTxAction(
        paymentRequestId,
        hash,
        wallet.address ?? "0x0000000000000000000000000000000000000000",
      );
      setWalletUi("pending");
      let result = await verifyRentPaymentAction(
        paymentRequestId,
        hash,
        wallet.address ?? "0x0000000000000000000000000000000000000000",
      );
      let attempts = 0;
      while (result.status === "pending" && attempts < 5) {
        await wait(4000);
        result = await verifyRentPaymentAction(
          paymentRequestId,
          hash,
          wallet.address ?? "0x0000000000000000000000000000000000000000",
        );
        attempts += 1;
      }
      if (result.status === "confirmed") {
        setWalletUi("confirmed");
        router.refresh();
      } else {
        setWalletUi("pending");
        setError(result.reason ?? copy.awaiting);
      }
    } catch (err) {
      if (isUserSafeConfigError(err)) {
        setWalletUi("failed");
        setError(copy.notConfiguredBody);
        return;
      }
      setWalletUi(err instanceof Error && /reverted/i.test(err.message) ? "reverted" : "failed");
      setError(err instanceof Error ? err.message : copy.failed);
    } finally {
      setBusy(false);
    }
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

              <div className="flex flex-col gap-2">
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
                <p className="text-xs text-muted-foreground">{copy.payByWalletBody}</p>
              </div>

              <WalletConnection onConnectedChange={setConnected} />

              {connected && onBaseSepolia ? (
                <div className="space-y-2">
                  <Button
                    type="button"
                    className="min-h-11 w-full"
                    variant="outline"
                    disabled={busy || approved}
                    onClick={() => void handleApprove()}
                  >
                    {approved ? copy.approved : copy.approveUsdc}
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11 w-full"
                    disabled={!approved || inFlight}
                    onClick={() => void handlePay()}
                  >
                    {walletUi === "pending"
                      ? copy.awaiting
                      : copy.confirmPay}
                  </Button>
                </div>
              ) : null}

              {walletUi === "pending" ? (
                <Alert>
                  <AlertTitle>{copy.pending}</AlertTitle>
                  <AlertDescription>{copy.awaiting}</AlertDescription>
                </Alert>
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
        {copy.memoNote}
      </p>
    </div>
  );
}