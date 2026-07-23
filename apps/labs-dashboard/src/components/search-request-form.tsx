"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { FieldLabel } from "@/components/field-label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SearchRequestForm({ guided = false }: { guided?: boolean }) {
  const router = useRouter();
  const [transactionType, setTransactionType] = useState("either");
  const [renovation, setRenovation] = useState("unknown");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: HTMLFormElement) {
    const fields = new FormData(form);
    const minPrice = Number(fields.get("minPrice")) || null;
    const maxPrice = Number(fields.get("maxPrice")) || null;
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      setError("Minimum budget cannot be greater than maximum budget.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/search-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: fields.get("title"),
          transactionType,
          minPrice: fields.get("minPrice"),
          maxPrice: fields.get("maxPrice"),
          minBedrooms: fields.get("minBedrooms"),
          preferredNeighbourhoods: String(fields.get("neighbourhoods") ?? "")
            .split(",")
            .map((value) => value.trim()),
          renovationWillingness: renovation,
          notes: fields.get("notes"),
          intakeSource: guided ? "what_fits_me" : "direct",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Unable to create request.");
      router.push(`/match-reports/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create request.");
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Property Search</CardTitle>
        <CardDescription>
          Fill in what you know — every field except the name is optional. For
          natural-language intake and live matching, use What Fits Me.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(event.currentTarget);
          }}
        >
          <fieldset disabled={busy} className="contents">
          <div className="min-w-0">
            <FieldLabel htmlFor="sr-title">Request name</FieldLabel>
            <Input
              id="sr-title"
              name="title"
              required
              placeholder={guided ? "e.g. Family home search" : "e.g. Beach apartment hunt"}
            />
          </div>
          <div className="min-w-0">
            <FieldLabel>Buy or rent</FieldLabel>
            <Select value={transactionType} onValueChange={setTransactionType}>
              <SelectTrigger className="w-full" aria-label="Buy or rent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="either">Buy or rent — either</SelectItem>
                <SelectItem value="sale">Buy</SelectItem>
                <SelectItem value="rent">Rent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="sr-min-price">Minimum budget (XCG)</FieldLabel>
            <Input
              id="sr-min-price"
              name="minPrice"
              type="number"
              min="0"
              placeholder="e.g. 250000"
            />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="sr-max-price">Maximum budget (XCG)</FieldLabel>
            <Input
              id="sr-max-price"
              name="maxPrice"
              type="number"
              min="0"
              placeholder="e.g. 600000"
            />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="sr-bedrooms">Minimum bedrooms</FieldLabel>
            <Input
              id="sr-bedrooms"
              name="minBedrooms"
              type="number"
              min="0"
              placeholder="e.g. 3"
            />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="sr-neighbourhoods">
              Preferred neighbourhoods
            </FieldLabel>
            <Input
              id="sr-neighbourhoods"
              name="neighbourhoods"
              placeholder="e.g. Jan Thiel, Piscadera (comma-separated)"
            />
          </div>
          <div className="min-w-0">
            <FieldLabel>Willing to renovate?</FieldLabel>
            <Select value={renovation} onValueChange={setRenovation}>
              <SelectTrigger className="w-full" aria-label="Willing to renovate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Not sure yet</SelectItem>
                <SelectItem value="none">No — move-in ready only</SelectItem>
                <SelectItem value="light">Light work is fine</SelectItem>
                <SelectItem value="moderate">Moderate work is fine</SelectItem>
                <SelectItem value="major">Open to major work</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="sr-notes">Notes or dealbreakers</FieldLabel>
            <Input
              id="sr-notes"
              name="notes"
              placeholder="e.g. must have a pool, no main roads"
            />
          </div>
          {error ? (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertTitle>Could not create the request</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy ? "Creating…" : "Create Property Search"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Labs only — no paywall, billing, or email delivery.
            </p>
          </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
