"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePayoutAddressAction } from "@/lib/rent-advance/actions";
import { isValidPayoutAddress } from "@/lib/rent-advance/custody";
import { PLAIN } from "@/lib/rent-advance/copy";

export function PayoutAddressForm({ savedAddress }: { savedAddress: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [address, setAddress] = useState(savedAddress ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const valid = isValidPayoutAddress(address);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          try {
            await savePayoutAddressAction(address);
            setSaved(true);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "The address could not be saved.");
          }
        });
      }}
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {saved ? (
        <Alert>
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>
            This address will be locked at mint. It is never shown on payer or
            purchaser screens.
          </AlertDescription>
        </Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">{PLAIN.payoutAddress}</p>
      <div className="space-y-1.5">
        <Label htmlFor="payout-address">Base Sepolia payout address</Label>
        <Input
          id="payout-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0x351a767a5Bbfe0EE9ca3aA246c2b6732Dc4e43D8"
          autoComplete="off"
          spellCheck={false}
        />
        {address && !valid ? (
          <p className="text-xs text-destructive">
            Enter a valid checksummed Base Sepolia 0x address.
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending || !valid}>
        Save payout method
      </Button>
    </form>
  );
}