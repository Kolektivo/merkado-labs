"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";
import { truncateHash } from "@/lib/rent-advance/ids";

export function WalletIdentity({ className }: { className?: string }) {
  const router = useRouter();
  const identity = useWalletIdentity();
  const address = identity.identity?.address;

  return (
    <div className={className}>
      {address ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Signed in as <span className="font-mono text-foreground">{truncateHash(address)}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void identity.signOut().then(() => router.refresh());
            }}
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => {
            void identity.signIn().then(() => router.refresh());
          }}
          disabled={identity.signing || identity.loading}
        >
          {identity.signing
            ? identity.wallet.isConnected
              ? "Signing…"
              : "Opening wallet…"
            : identity.wallet.isConnected
              ? "Sign in with wallet"
              : "Connect wallet"}
        </Button>
      )}
      {identity.error ? <p className="mt-2 text-xs text-destructive" aria-live="polite">{identity.error}</p> : null}
    </div>
  );
}
