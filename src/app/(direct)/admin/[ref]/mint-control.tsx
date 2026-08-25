"use client";

import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { truncateHash } from "@/lib/rent-advance/ids";

export function MintControl({
  configured,
  tokenId,
  contractAddress,
  mintTxHash,
  purchased,
  minterAddress,
}: {
  configured: boolean;
  tokenId: number | null;
  contractAddress: string | null;
  mintTxHash: string | null;
  purchased: boolean;
  minterAddress: string | null;
}) {
  const state = purchased
    ? "purchased"
    : tokenId != null && mintTxHash
      ? "minted"
      : "not_minted";

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
