"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { CopyValue } from "@/components/copy-value";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  prepareMintAction,
  verifyOfferMintedAction,
} from "@/lib/rent-advance/actions";
import { truncateHash } from "@/lib/rent-advance/ids";

export type MintCalldataView = {
  offerKey: string;
  payoutAddress: string;
  purchasePriceAtomic: bigint;
  rentInstallmentAtomic: bigint;
  calldata: string;
};

export function MintControl({
  reference,
  configured,
  offerKey,
  tokenId,
  contractAddress,
  mintTxHash,
  purchased,
  calldata,
}: {
  reference: string;
  configured: boolean;
  offerKey: string | null;
  tokenId: number | null;
  contractAddress: string | null;
  mintTxHash: string | null;
  purchased: boolean;
  calldata: MintCalldataView | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState("");
  const [verifyTokenId, setVerifyTokenId] = useState(tokenId != null ? String(tokenId) : "");

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
          if (status === "pending") {
            setMessage("Transaction is pending on chain. Verify again once it is indexed.");
          } else if (status === "confirmed") {
            setMessage("Verified on Base Sepolia.");
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
            <Label htmlFor="offer-key">Offer key</Label>
            <p id="offer-key" className="min-h-11 rounded-xl border bg-muted/40 px-3 py-2.5 font-mono text-xs">
              {offerKey ? truncateHash(offerKey, 10, 8) : "Not prepared yet"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contract-address">Contract</Label>
            <p id="contract-address" className="min-h-11 rounded-xl border bg-muted/40 px-3 py-2.5 font-mono text-xs">
              {contractAddress ? truncateHash(contractAddress) : "Not configured"}
            </p>
          </div>
        </div>

        {state === "not_minted" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending || !configured}
              onClick={() => run(() => prepareMintAction(reference))}
            >
              {pending ? "Preparing…" : "Prepare mint"}
            </Button>
          </div>
        ) : null}

        {state === "not_minted" ? (
          <div className="rounded-xl border p-4">
            <p className="text-sm font-medium">Verify the Safe mint</p>
            <p className="mt-1 text-xs text-muted-foreground">
              After operators execute mintOffer from the Safe, enter the token
              id returned by the Safe and the mint transaction hash.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="verify-token-id">Token id</Label>
                <Input
                  id="verify-token-id"
                  value={verifyTokenId}
                  onChange={(event) => setVerifyTokenId(event.target.value)}
                  placeholder="1"
                  disabled={!configured}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verify-mint-tx">Mint tx hash</Label>
                <Input
                  id="verify-mint-tx"
                  value={txHash}
                  onChange={(event) => setTxHash(event.target.value)}
                  placeholder="0x…"
                  disabled={!configured}
                />
              </div>
            </div>
            <Button
              type="button"
              className="mt-3"
              disabled={pending || !configured || !txHash || !verifyTokenId}
              onClick={() =>
                run(() => verifyOfferMintedAction(reference, txHash, verifyTokenId))
              }
            >
              {pending ? "Verifying…" : "Verify mint"}
            </Button>
          </div>
        ) : null}

        {calldata ? (
          <div className="rounded-xl border p-4">
            <p className="text-sm font-medium">Mint calldata (read-only)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Operators execute this against mintOffer from the Safe. No signing
              or execution happens here.
            </p>
            <div className="mt-3 space-y-1.5">
              <p className="text-xs text-muted-foreground">
                mintOffer(offerKey, payout, purchasePriceAtomic, rentInstallmentAtomic)
              </p>
              <CopyValue
                value={calldata.calldata}
                label="mint calldata"
                truncate
              />
            </div>
          </div>
        ) : state === "not_minted" && configured ? (
          <p className="text-xs text-muted-foreground">
            Prepare the mint to generate the calldata for the Safe.
          </p>
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