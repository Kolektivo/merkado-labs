"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setContractAddressAction } from "@/lib/rent-advance/actions";

/**
 * Set or clear the live Merkado offer contract address. The address is a
 * variable: after each Base Sepolia redeploy (paired with Reset) the operator
 * updates it here so the app, mint sweep, and wallet actions switch without a
 * Vercel env change. Empty falls back to NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS.
 */
export function ContractAddressForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await setContractAddressAction(value);
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the address.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="contract-address">Merkado offer contract address</Label>
        <Input
          id="contract-address"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Update this after each Base Sepolia redeploy (paired with Reset).
          Empty uses the NEXT_PUBLIC_MERKADO_CONTRACT_ADDRESS environment default.
        </p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {saved ? (
        <Alert>
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>The live flow now uses this address.</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save contract address"}
      </Button>
    </div>
  );
}