"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { WalletConnection } from "@/components/wallet-connection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/pay/networks";
import { approveUsdc, purchaseOffer } from "@/lib/pay/wallet-adapter";
import { verifyPurchaseAction } from "@/lib/rent-advance/actions";
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
  minted,
  configured,
  tokenId,
}: {
  reference: string;
  remainingCents: number;
  fundedCents: number;
  offeringCents: number;
  minted: boolean;
  configured: boolean;
  tokenId: number | null;
}) {
  const router = useRouter();
  const wallet = useMerkadoWallet();
  const startTransition = useTransition()[1];
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const onBaseSepolia = wallet.chainId === BASE_SEPOLIA_CHAIN_ID;

  const closed = remainingCents <= 0;

  function handleApprove() {
    setError(null);
    setBusy(true);
    startTransition(async () => {
      try {
        await approveUsdc(wallet, BigInt(remainingCents * 10_000));
        setApproved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "The approval did not go through.");
      } finally {
        setBusy(false);
      }
    });
  }

  function handlePurchase() {
    setError(null);
    setBusy(true);
    setApproved(false);
    startTransition(async () => {
      try {
        const { hash } = await purchaseOffer(wallet, BigInt(tokenId ?? 0));
        let result = await verifyPurchaseAction(
          reference,
          hash,
          wallet.address ?? "0x0000000000000000000000000000000000000000",
        );
        let attempts = 0;
        while (result.status === "pending" && attempts < 5) {
          await wait(4000);
          result = await verifyPurchaseAction(
            reference,
            hash,
            wallet.address ?? "0x0000000000000000000000000000000000000000",
          );
          attempts += 1;
        }
        if (result.status !== "confirmed") {
          setError(result.reason ?? "The purchase is still pending on chain.");
          return;
        }
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Purchase failed.");
      } finally {
        setBusy(false);
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
        100% of the offer NFT · no fractional purchase
      </p>

      {!minted ? (
        <Alert className="mt-6">
          <AlertTitle>Mint pending</AlertTitle>
          <AlertDescription>
            The company Safe has not minted this offer NFT yet. It becomes
            purchasable once the mint is verified on Base Sepolia.
          </AlertDescription>
        </Alert>
      ) : !configured ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Purchases are not configured yet</AlertTitle>
          <AlertDescription>
            NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS is not set. Nothing was sent.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="mt-6 space-y-3">
          <WalletConnection onConnectedChange={setConnected} />
          {connected && onBaseSepolia ? (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                disabled={busy || approved}
                onClick={handleApprove}
              >
                {approved ? "USDC approved" : "Approve USDC"}
              </Button>
              <Button
                type="button"
                className="h-11 w-full"
                disabled={busy || !approved}
                onClick={handlePurchase}
              >
                {busy ? "Purchasing…" : `Purchase whole offer · ${formatXcg(remainingCents)}`}
              </Button>
            </div>
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
          After purchase, the offer NFT moves to Portfolio. Rent paid into the
          offer contract can be claimed by its current owner.
        </p>
      )}
    </div>
  );
}