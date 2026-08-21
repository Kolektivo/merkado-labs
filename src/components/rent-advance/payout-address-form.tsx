"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePayoutAddressAction } from "@/lib/rent-advance/actions";
import { PLAIN } from "@/lib/rent-advance/copy";

export function PayoutAddressForm({ savedAddress }: { savedAddress: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [address, setAddress] = useState(savedAddress ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
            This demo will use this address when you claim. Nothing is sent.
          </AlertDescription>
        </Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">{PLAIN.payoutAddress}</p>
      <div className="space-y-1.5">
        <Label htmlFor="payout-address">Demo payout address</Label>
        <Input
          id="payout-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0xDEMOLANDLORD001"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <Button type="submit" disabled={pending || !address.trim()}>
        Save payout method
      </Button>
    </form>
  );
}
