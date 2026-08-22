"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { autoMintAction } from "@/lib/rent-advance/actions";
import { truncateHash } from "@/lib/rent-advance/ids";

export function MintControl({
  reference,
  configured,
  tokenId,
  contractAddress,
  mintTxHash,
  purchased,
  minterAddress,
}: {
  reference: string;
  configured: boolean;
  tokenId: number | null;
  contractAddress: string | null;
  mintTxHash: string | null;
  purchased: boolean;
  minterAddress: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const state = purchased
    ? "purchased"
    : tokenId != null && mintTxHash
      ? "minted"
      : "not_minted";

  function run(action: () => Promise<unknown>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result && typeof result === "object" && "status" in result) {
          const status = (result as { status?: string }).status;
          if (status === "submitted") {
            setMessage("Mint transaction broadcast. Waiting for confirmation…");
          } else if (status === "pending") {
            setMessage("Mint is pending on chain. It confirms once the receipt is verified.");
          } else if (status === "confirmed") {
            setMessage("Offer NFT minted and verified on Base Sepolia.");
          }
        } else {
          setMessage("Done.");
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "The action failed.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Mint status
          <StatusBadge
            tone={state === "purchased" ? "success" : state === "minted" ? "info" : "warning"}
          >
            {state === "purchased"
              ? "Purchased"
              : state === "minted"
                ? `Minted · token ${tokenId}`
                : "Not minted (Mint pending)"}
          </StatusBadge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured ? (
          <Alert variant="destructive">
            <AlertTitle>Not configured</AlertTitle>
            <AlertDescription>
              NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS is not set. Minting is not
              available until the contract is deployed and configured.
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not complete</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {message ? (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Contract</p>
            <p className="min-h-11 rounded-xl border bg-muted/40 px-3 py-2.5 font-mono text-xs">
              {contractAddress ? truncateHash(contractAddress) : "Not configured"}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Server mint key</p>
            <p className="min-h-11 rounded-xl border bg-muted/40 px-3 py-2.5 font-mono text-xs">
              {minterAddress ? truncateHash(minterAddress) : "Not configured"}
            </p>
          </div>
        </div>

        {state === "not_minted" ? (
          <div className="rounded-xl border p-4">
            <p className="text-sm font-medium">Mint automatically</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The backend broadcasts mintOffer from the server mint key and
              verifies the receipt. No Safe execution or manual hash entry.
            </p>
            <Button
              type="button"
              className="mt-3"
              disabled={pending || !configured}
              onClick={() => run(() => autoMintAction(reference))}
            >
              {pending ? "Minting…" : "Mint now"}
            </Button>
          </div>
        ) : null}

        {mintTxHash && contractAddress ? (
          <p className="text-xs text-muted-foreground">
            Minted in{" "}
            <a
              href={`https://sepolia.basescan.org/tx/${mintTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {truncateHash(mintTxHash)}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
