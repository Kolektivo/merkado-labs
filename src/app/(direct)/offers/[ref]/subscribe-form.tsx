"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { WalletLinkPanel } from "@/components/wallet-link-panel";
import { ApproveThenSendDialog } from "@/components/rent-advance/approve-then-send-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/pay/networks";
import { approveUsdc, purchaseOffer } from "@/lib/pay/wallet-adapter";
import {
  attachSubmittedPurchaseTxAction,
  checkPendingPurchaseAction,
  verifyPurchaseAction,
} from "@/lib/rent-advance/actions";
import { formatXcg } from "@/lib/rent-advance/money";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
  const startTransition = useTransition()[1];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const onBaseSepolia = wallet.chainId === BASE_SEPOLIA_CHAIN_ID;
  const connected = wallet.isConnected && Boolean(wallet.address);
  const linkedMatches =
    linkedWalletAddress != null &&
    wallet.address?.toLowerCase() === linkedWalletAddress.toLowerCase();
  const walletReady = connected && linkedMatches && onBaseSepolia;

  const closed = remainingCents <= 0;

  async function runApprove() {
    await approveUsdc(wallet, BigInt(remainingCents * 10_000), contractAddress);
  }

  async function runSend() {
    let hash: string | null = null;
    try {
      const { hash: txHash } = await purchaseOffer(wallet, BigInt(tokenId ?? 0), contractAddress);
      hash = txHash;
      await attachSubmittedPurchaseTxAction(reference, txHash, wallet.address ?? ZERO_ADDRESS);
      let result = await verifyPurchaseAction(reference, txHash, wallet.address ?? ZERO_ADDRESS);
      let attempts = 0;
      while (result.status === "pending" && attempts < 5) {
        await wait(4000);
        result = await verifyPurchaseAction(reference, txHash, wallet.address ?? ZERO_ADDRESS);
        attempts += 1;
      }
      if (result.status === "confirmed") {
        return { status: "confirmed" as const };
      }
      return {
        status: "pending" as const,
        reason: result.reason ?? "The purchase is still being verified.",
      };
    } catch (err) {
      if (hash) {
        return {
          status: "pending" as const,
          reason:
            err instanceof Error
              ? err.message
              : "The purchase was submitted and is still being verified.",
        };
      }
      throw err;
    }
  }

  async function runCheckStatus() {
    const result = await checkPendingPurchaseAction(reference);
    if (result.status === "confirmed") return { status: "confirmed" as const };
    return {
      status: "pending" as const,
      reason: result.reason ?? "The purchase is still being verified.",
    };
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

  async function handleCheckStatus() {
    setError(null);
    setChecking(true);
    startTransition(async () => {
      try {
        const result = await checkPendingPurchaseAction(reference);
        if (result.status === "confirmed") {
          onConfirmed();
        } else {
          setError(result.reason ?? "The purchase is still being verified.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not check the purchase status.");
      } finally {
        setChecking(false);
      }
    });
  }

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
          <WalletLinkPanel initialLinkedAddress={linkedWalletAddress} />
          {walletReady ? (
            <Button
              type="button"
              className="h-11 w-full"
              onClick={() => setDialogOpen(true)}
            >
              {`Purchase whole offer · ${formatXcg(remainingCents)}`}
            </Button>
          ) : null}
          {pendingRecovery ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={checking}
              onClick={handleCheckStatus}
            >
              {checking ? "Checking…" : "Check purchase status"}
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
        runCheckStatus={runCheckStatus}
        onConfirmed={onConfirmed}
      />
    </div>
  );
}
