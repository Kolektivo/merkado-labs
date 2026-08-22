"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { HelpTip } from "@/components/help-tip";
import { WalletConnection } from "@/components/wallet-connection";
import { Money } from "@/components/money-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/pay/networks";
import { claimRent } from "@/lib/pay/wallet-adapter";
import { verifyRentClaimAction } from "@/lib/rent-advance/actions";
import { formatXcg } from "@/lib/rent-advance/money";

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function ClaimRentForm({
  reference,
  tokenId,
  amountCents,
  configured,
}: {
  reference: string;
  tokenId: number | null;
  amountCents: number;
  configured: boolean;
}) {
  const router = useRouter();
  const wallet = useMerkadoWallet();
  const [pending, startTransition] = useTransition();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const onBaseSepolia = wallet.chainId === BASE_SEPOLIA_CHAIN_ID;
  const canClaim =
    configured && tokenId != null && connected && onBaseSepolia && !claiming;

  function handleClaim() {
    setError(null);
    startTransition(async () => {
      setClaiming(true);
      try {
        const { hash } = await claimRent(wallet, BigInt(tokenId ?? 0));
        let result = await verifyRentClaimAction(
          reference,
          hash,
          wallet.address ?? "0x0000000000000000000000000000000000000000",
        );
        let attempts = 0;
        while (result.status === "pending" && attempts < 5) {
          await wait(4000);
          result = await verifyRentClaimAction(
            reference,
            hash,
            wallet.address ?? "0x0000000000000000000000000000000000000000",
          );
          attempts += 1;
        }
        if (result.status !== "confirmed") {
          setError(result.reason ?? "The claim is still pending on chain.");
          return;
        }
        try {
          window.sessionStorage.setItem(
            `merkado:success:rent:${reference}`,
            formatXcg(amountCents),
          );
        } catch {
          // The claim succeeded; the amount is optional dialog detail.
        }
        router.push(`/portfolio/${reference}?success=rent`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "The claim failed.");
      } finally {
        setClaiming(false);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not claim</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-center justify-between gap-4 rounded-xl bg-primary/5 p-4">
        <div>
          <p className="text-sm text-muted-foreground">Rent ready</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-primary">
            <Money cents={amountCents} />
          </p>
        </div>
        <HelpTip label="claiming rent">
          This is monthly rent the renter paid into the offer contract. It
          belongs to the current NFT owner, not the landlord.
        </HelpTip>
      </div>
      {!configured ? (
        <Alert variant="destructive">
          <AlertTitle>Claims are not configured yet</AlertTitle>
          <AlertDescription>
            NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS is not set. Nothing was claimed.
          </AlertDescription>
        </Alert>
      ) : tokenId == null ? (
        <Alert>
          <AlertTitle>Listing not minted</AlertTitle>
          <AlertDescription>
            This offer NFT does not exist yet, so nothing can be claimed.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <WalletConnection onConnectedChange={setConnected} />
          {canClaim ? (
            <Button
              type="button"
              className="min-h-11 w-full px-4 md:w-auto"
              disabled={pending || claiming}
              onClick={handleClaim}
            >
              {claiming ? "Claiming…" : "Claim rent"}
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            The current NFT owner claims pooled rent from the offer contract on
            Base Sepolia.
          </p>
        </>
      )}
    </div>
  );
}