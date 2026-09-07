"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { WalletConnection } from "@/components/wallet-connection";
import { ApproveThenSendDialog } from "@/components/rent-advance/approve-then-send-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";
import type { ApproveThenSendOutcome } from "@/lib/pay/approve-then-send-state";
import { OP_MAINNET_CHAIN_ID } from "@/lib/pay/networks";
import {
  approveUsdc,
  checkWalletPurchaseReadiness,
  purchaseOffer,
  simulateWalletPurchase,
  waitForSuccessfulWalletTransaction,
} from "@/lib/pay/wallet-adapter";
import {
  attachSubmittedPurchaseTxAction,
  checkPendingPurchaseAction,
  preflightPurchaseAction,
  settlePurchaseAttemptAction,
  verifyPurchaseAction,
} from "@/lib/rent-advance/actions";
import { formatXcg } from "@/lib/rent-advance/money";

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function SubscribeForm({
  reference,
  remainingCents,
  fundedCents,
  offeringCents,
  expiresLabel,
  minted,
  configured,
  tokenId,
  contractAddress,
  pendingRecovery,
  linkedWalletAddress,
}: {
  reference: string;
  remainingCents: number;
  fundedCents: number;
  offeringCents: number;
  expiresLabel: string | null;
  minted: boolean;
  configured: boolean;
  tokenId: number | null;
  contractAddress: string | null;
  pendingRecovery: boolean;
  linkedWalletAddress: string | null;
}) {
  const router = useRouter();
  const wallet = useMerkadoWallet();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = wallet.isConnected;
  const onOptimismMainnet = wallet.chainId === OP_MAINNET_CHAIN_ID;
  const connectedMatchesLinked =
    connected &&
    linkedWalletAddress != null &&
    wallet.address?.toLowerCase() === linkedWalletAddress.toLowerCase();
  const walletReady = connectedMatchesLinked && onOptimismMainnet;

  const closed = remainingCents <= 0;
  const amountAtomic = BigInt(remainingCents * 10_000);

  async function runApprove() {
    const buyer = wallet.address;
    if (!buyer) throw new Error("Connect a wallet first.");
    const preflight = await preflightPurchaseAction(reference, buyer);
    if (!preflight.ok) throw new Error(preflight.error);
    const readiness = await checkWalletPurchaseReadiness(
      wallet,
      amountAtomic,
    );
    if (!readiness.ok) throw new Error(readiness.error);
    await approveUsdc(wallet, amountAtomic, contractAddress);
  }

  async function runSend(): Promise<ApproveThenSendOutcome> {
    const buyer = wallet.address;
    if (!buyer) return { status: "error", message: "Connect a wallet first." };
    const preflight = await preflightPurchaseAction(reference, buyer);
    if (!preflight.ok) return { status: "error", message: preflight.error };
    const simulation = await simulateWalletPurchase(
      wallet,
      BigInt(tokenId ?? 0),
      contractAddress,
    );
    if (!simulation.ok) {
      return { status: "error", message: simulation.error };
    }
    let hash: string | null = null;
    try {
      const { hash: txHash } = await purchaseOffer(
        wallet,
        BigInt(tokenId ?? 0),
        contractAddress,
      );
      hash = txHash;
      const attach = await attachSubmittedPurchaseTxAction(
        reference,
        txHash,
        buyer,
      );
      if (!attach.ok) {
        // The chain is authoritative: verification still applies this hash
        // even if the attachment could not be recorded.
      }
      try {
        await waitForSuccessfulWalletTransaction(
          wallet.provider!,
          txHash,
          "Purchase",
        );
      } catch (err) {
        await settlePurchaseAttemptAction(
          reference,
          txHash,
          "failed",
          err instanceof Error ? err.message : "reverted",
        );
        return {
          status: "error",
          message:
            "The purchase transaction reverted on Optimism Mainnet. You can try again.",
        };
      }
      let result = await verifyPurchaseAction(reference, txHash, buyer);
      while (result.status === "pending") {
        await wait(4000);
        result = await verifyPurchaseAction(reference, txHash, buyer);
      }
      if (result.status === "confirmed") {
        return { status: "confirmed" };
      }
      return {
        status: "error",
        message: result.reason ?? "The purchase could not be verified.",
      };
    } catch (err) {
      if (hash) {
        return {
          status: "pending",
          reason:
            err instanceof Error
              ? err.message
              : "The purchase was submitted and is still being verified.",
        };
      }
      throw err;
    }
  }

  async function runVerifyPending(): Promise<ApproveThenSendOutcome> {
    const result = await checkPendingPurchaseAction(reference);
    if (result.status === "confirmed") return { status: "confirmed" };
    if (result.status === "failed") {
      return {
        status: "error",
        message: result.reason ?? "The purchase could not be verified.",
      };
    }
    return { status: "pending", reason: result.reason };
  }

  function onConfirmed() {
    try {
      window.sessionStorage.setItem(
        `merkado:success:purchase:${reference}`,
        formatXcg(remainingCents),
      );
    } catch {
      // The purchase succeeded; the amount is optional dialog detail.
    }
    router.push(`/portfolio/${reference}?success=purchase`);
    router.refresh();
  }

  async function openPurchaseDialog() {
    if (!walletReady) {
      setError("Link this wallet to your account before purchasing.");
      return;
    }
    const buyer = wallet.address;
    if (!buyer) {
      setError("Connect a wallet first.");
      return;
    }
    setError(null);
    try {
      const preflight = await preflightPurchaseAction(reference, buyer);
      if (!preflight.ok) {
        setError(preflight.error);
        return;
      }
      const readiness = await checkWalletPurchaseReadiness(
        wallet,
        amountAtomic,
      );
      if (!readiness.ok) {
        setError(readiness.error);
        return;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not prepare the purchase.",
      );
      return;
    }
    setDialogOpen(true);
  }

  useEffect(() => {
    if (!pendingRecovery) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const result = await checkPendingPurchaseAction(reference);
          if (result.status === "confirmed") {
            try {
              window.sessionStorage.setItem(
                `merkado:success:purchase:${reference}`,
                formatXcg(remainingCents),
              );
            } catch {
              // The purchase succeeded; the amount is optional dialog detail.
            }
            router.push(`/portfolio/${reference}?success=purchase`);
            router.refresh();
            return;
          }
          if (result.status === "failed") {
            setError(
              result.reason ?? "The purchase could not be verified.",
            );
            return;
          }
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "The purchase is still being verified.",
          );
          return;
        }
        await wait(4000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [pendingRecovery, reference, remainingCents, router]);

  if (closed) {
    return fundedCents > 0 ? (
      <div className="rounded-2xl border border-grey-200 bg-white p-6 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
        <p className="text-sm font-medium text-grey-800">Offering</p>
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

      {!minted ? (
        <Alert className="mt-6">
          <AlertTitle>Not available yet</AlertTitle>
          <AlertDescription>
            This listing is not open to purchase yet. It becomes available
            once it is listed on Marketplace.
          </AlertDescription>
        </Alert>
      ) : !configured ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Purchases are not configured yet</AlertTitle>
          <AlertDescription>
            Merkado has not set the live payment address yet. Nothing was sent.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="mt-6 space-y-3">
          <WalletConnection />
          <Button
            type="button"
            className="h-11 w-full"
            disabled={!walletReady}
            onClick={() => void openPurchaseDialog()}
          >
            {`Purchase whole offer · ${formatXcg(remainingCents)}`}
          </Button>
          {connected && !connectedMatchesLinked ? (
            <Button asChild type="button" variant="outline" className="h-11 w-full">
              <Link href="/account/apps">Link this wallet in Account</Link>
            </Button>
          ) : null}
        </div>
      )}

      {fundedCents > 0 ? (
        <Link
          href={`/portfolio/${reference}`}
          className="mt-4 flex min-h-11 items-center justify-center text-center text-sm text-grey-800 hover:text-surface-dark"
        >
          View current position
        </Link>
      ) : (
        <p className="mt-4 text-center text-xs leading-5 text-grey-800">
          After purchase, the offer moves to your Portfolio. Rent paid for the
          listing can be claimed by its owner.
        </p>
      )}

      <ApproveThenSendDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Purchase the whole offer"
        description={`${formatXcg(remainingCents)} · 100% ownership. The exact USDC amount is approved, then the offer is bought in one flow.`}
        confirmLabel={`Approve and purchase · ${formatXcg(remainingCents)}`}
        sendLabel="Purchasing"
        needsApproval
        summary={
          <div className="rounded-xl bg-muted/40 p-4 text-sm">
            <p className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Whole offer</span>
              <span className="font-medium tabular-nums">{formatXcg(remainingCents)}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              100% ownership · no fractional purchase
            </p>
          </div>
        }
        runApprove={runApprove}
        runSend={runSend}
        runVerifyPending={runVerifyPending}
        onConfirmed={onConfirmed}
      />
    </div>
  );
}