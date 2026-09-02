"use client";

import { useCallback, useEffect, useState } from "react";

import { Check, Link2, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WalletConnection } from "@/components/wallet-connection";
import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";
import { truncateHash } from "@/lib/rent-advance/ids";
import { ensureBaseSepolia } from "@/lib/pay/wallet-adapter";
import {
  getLinkedWalletAction,
  issueLinkChallengeAction,
  unlinkWalletAction,
  verifyLinkChallengeAction,
} from "@/lib/wallet-link/actions";
import { signLinkMessage } from "@/lib/wallet-link/sign";
import { cn } from "@/lib/utils";

function rejectedInWallet(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && typeof current === "object" && depth < 6; depth += 1) {
    const value = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (value.code === 4001) return true;
    const name = value.name;
    if (typeof name === "string" && /(user.?rejected|action.?rejected)/i.test(name)) {
      return true;
    }
    current = value.cause;
  }
  return false;
}

/**
 * "Connect wallet" then "Link wallet" flow. Connection alone never links: the
 * connected wallet must sign a server-issued, domain/chain/account/nonce-bound
 * challenge before it becomes the account's single active linked wallet.
 */
export function WalletLinkPanel({
  initialLinkedAddress = null,
  onLinkedChange,
  className,
}: {
  initialLinkedAddress?: string | null;
  onLinkedChange?: (address: string | null) => void;
  className?: string;
}) {
  const wallet = useMerkadoWallet();
  const [linkedAddress, setLinkedAddress] = useState<string | null>(
    initialLinkedAddress,
  );
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [confirmingUnlink, setConfirmingUnlink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyLinked = useCallback(
    (address: string | null) => {
      setLinkedAddress(address);
      onLinkedChange?.(address);
    },
    [onLinkedChange],
  );

  useEffect(() => {
    let cancelled = false;
    void getLinkedWalletAction().then((result) => {
      if (cancelled || !result.ok) return;
      applyLinked(result.address);
    });
    return () => {
      cancelled = true;
    };
  }, [applyLinked]);

  const connected = wallet.isConnected && Boolean(wallet.address);
  const connectedMatchesLinked =
    connected &&
    linkedAddress != null &&
    wallet.address?.toLowerCase() === linkedAddress.toLowerCase();

  async function handleLink() {
    if (!wallet.provider || !wallet.address) return;
    setError(null);
    setLinking(true);
    try {
      await ensureBaseSepolia(wallet, true);
      const issued = await issueLinkChallengeAction();
      if (!issued.ok) {
        setError(issued.error);
        return;
      }
      const signature = await signLinkMessage(
        wallet.provider,
        wallet.address,
        issued.challenge.message,
      );
      const verified = await verifyLinkChallengeAction({
        nonce: issued.challenge.nonce,
        signature,
        walletAddress: wallet.address,
        domain: issued.challenge.domain,
        chainId: issued.challenge.chainId,
      });
      if (!verified.ok) {
        setError(verified.error);
        return;
      }
      applyLinked(verified.linkedAddress);
      setConfirmingUnlink(false);
    } catch (err) {
      if (rejectedInWallet(err)) {
        setError("Signing was cancelled in your wallet.");
      } else {
        setError(err instanceof Error ? err.message : "Could not link the wallet. Try again.");
      }
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink() {
    setError(null);
    setUnlinking(true);
    try {
      const result = await unlinkWalletAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      applyLinked(null);
      setConfirmingUnlink(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlink the wallet. Try again.");
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="size-4 text-muted-foreground" aria-hidden />
          Linked wallet
        </p>
        {linkedAddress ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <Check className="size-3.5" aria-hidden />
            Linked
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Not linked
          </span>
        )}
      </div>

      {linkedAddress ? (
        <div className="rounded-lg border bg-muted/40 px-3 py-2">
          <p className="text-xs text-muted-foreground">Wallet address</p>
          <p className="truncate font-mono text-sm" title={linkedAddress}>
            {linkedAddress}
          </p>
        </div>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">
          Connect a wallet and link it to this account. Purchases and rent
          claims use the linked wallet.
        </p>
      )}

      <WalletConnection />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not link wallet</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {connected && linkedAddress == null ? (
        <Button
          type="button"
          className="min-h-11 w-full"
          disabled={linking}
          onClick={() => void handleLink()}
        >
          {linking ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Linking…
            </>
          ) : (
            "Link wallet"
          )}
        </Button>
      ) : null}

      {connected && linkedAddress != null && !connectedMatchesLinked ? (
        <div className="space-y-2">
          <p className="text-xs leading-5 text-muted-foreground">
            The connected wallet is not the linked one (
            {truncateHash(linkedAddress)}). Link this wallet to replace it.
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            disabled={linking}
            onClick={() => void handleLink()}
          >
            {linking ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Linking…
              </>
            ) : (
              "Link this wallet instead"
            )}
          </Button>
        </div>
      ) : null}

      {connectedMatchesLinked && !confirmingUnlink ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          onClick={() => setConfirmingUnlink(true)}
        >
          Unlink wallet
        </Button>
      ) : null}

      {connectedMatchesLinked && confirmingUnlink ? (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">
            Unlink this wallet from your account?
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={unlinking}
              onClick={() => setConfirmingUnlink(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={unlinking}
              onClick={() => void handleUnlink()}
            >
              {unlinking ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Unlinking…
                </>
              ) : (
                "Unlink"
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
