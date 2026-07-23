"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";

import { FieldLabel } from "@/components/field-label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PropertySearchRequest } from "@/lib/domain/types";
import { formatCurrency, titleCase } from "@/lib/format";

function listToInput(values: string[]): string {
  return values.join(", ");
}

function inputToList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function SearchRequestReview({
  request,
}: {
  request: PropertySearchRequest;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState(
    request.transactionType ?? "either",
  );
  const [renovation, setRenovation] = useState(
    request.renovationWillingness ?? "unknown",
  );

  async function save(form: HTMLFormElement) {
    const fields = new FormData(form);
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/search-requests/${request.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: fields.get("title"),
          transactionType,
          minPrice: fields.get("minPrice"),
          maxPrice: fields.get("maxPrice"),
          minBedrooms: fields.get("minBedrooms"),
          minBathrooms: fields.get("minBathrooms"),
          propertyTypes: inputToList(String(fields.get("propertyTypes") ?? "")),
          preferredNeighbourhoods: inputToList(
            String(fields.get("neighbourhoods") ?? ""),
          ),
          mustHaves: inputToList(String(fields.get("mustHaves") ?? "")),
          preferences: inputToList(String(fields.get("preferences") ?? "")),
          dealbreakers: inputToList(String(fields.get("dealbreakers") ?? "")),
          renovationWillingness: renovation,
          notes: fields.get("notes"),
          persistMatches: true,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to update Property Search.");
      }
      setEditing(false);
      setMessage(
        "Criteria saved as a draft and matches refreshed. Confirm the Property Search again if needed.",
      );
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update Property Search.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Property Search criteria</CardTitle>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            Edit search
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {editing ? (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void save(event.currentTarget);
            }}
          >
            <fieldset disabled={busy} className="contents">
              <div>
                <FieldLabel htmlFor="review-title">Request name</FieldLabel>
                <Input
                  id="review-title"
                  name="title"
                  defaultValue={request.title ?? ""}
                  required
                />
              </div>
              <div>
                <FieldLabel>Buy or rent</FieldLabel>
                <Select
                  value={transactionType}
                  onValueChange={(value) =>
                    setTransactionType(value as "sale" | "rent" | "either")
                  }
                >
                  <SelectTrigger className="w-full" aria-label="Buy or rent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="either">Either</SelectItem>
                    <SelectItem value="sale">Buy</SelectItem>
                    <SelectItem value="rent">Rent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="review-min-price">
                  Minimum budget (XCG)
                </FieldLabel>
                <Input
                  id="review-min-price"
                  name="minPrice"
                  type="number"
                  min="0"
                  defaultValue={request.minPrice ?? ""}
                />
              </div>
              <div>
                <FieldLabel htmlFor="review-max-price">
                  Maximum budget (XCG)
                </FieldLabel>
                <Input
                  id="review-max-price"
                  name="maxPrice"
                  type="number"
                  min="0"
                  defaultValue={request.maxPrice ?? ""}
                />
              </div>
              <div>
                <FieldLabel htmlFor="review-bedrooms">
                  Minimum bedrooms
                </FieldLabel>
                <Input
                  id="review-bedrooms"
                  name="minBedrooms"
                  type="number"
                  min="0"
                  defaultValue={request.minBedrooms ?? ""}
                />
              </div>
              <div>
                <FieldLabel htmlFor="review-bathrooms">
                  Minimum bathrooms
                </FieldLabel>
                <Input
                  id="review-bathrooms"
                  name="minBathrooms"
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={request.minBathrooms ?? ""}
                />
              </div>
              <div>
                <FieldLabel htmlFor="review-types">Property types</FieldLabel>
                <Input
                  id="review-types"
                  name="propertyTypes"
                  defaultValue={listToInput(request.propertyTypes)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="review-neighbourhoods">
                  Required locations
                </FieldLabel>
                <Input
                  id="review-neighbourhoods"
                  name="neighbourhoods"
                  defaultValue={listToInput(request.preferredNeighbourhoods)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="review-must">Must-haves</FieldLabel>
                <Input
                  id="review-must"
                  name="mustHaves"
                  defaultValue={listToInput(request.mustHaves)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="review-prefs">Preferences</FieldLabel>
                <Input
                  id="review-prefs"
                  name="preferences"
                  defaultValue={listToInput(request.preferences)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="review-deals">Dealbreakers</FieldLabel>
                <Input
                  id="review-deals"
                  name="dealbreakers"
                  defaultValue={listToInput(request.dealbreakers)}
                />
              </div>
              <div>
                <FieldLabel>Willing to renovate?</FieldLabel>
                <Select value={renovation} onValueChange={setRenovation}>
                  <SelectTrigger
                    className="w-full"
                    aria-label="Willing to renovate"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Not sure yet</SelectItem>
                    <SelectItem value="none">Move-in ready only</SelectItem>
                    <SelectItem value="light">Light work</SelectItem>
                    <SelectItem value="moderate">Moderate work</SelectItem>
                    <SelectItem value="major">Major work</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="review-notes">Notes</FieldLabel>
                <Input
                  id="review-notes"
                  name="notes"
                  defaultValue={request.notes ?? ""}
                />
              </div>
              {error ? (
                <Alert variant="destructive" className="sm:col-span-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  {busy ? "Saving…" : "Save criteria"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </fieldset>
          </form>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Buy or rent</dt>
              <dd className="font-medium">
                {titleCase(request.transactionType ?? "either")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Budget (XCG)</dt>
              <dd className="font-medium">
                {request.minPrice !== null || request.maxPrice !== null
                  ? `${request.minPrice !== null ? formatCurrency(request.minPrice, "XCG") : "Any"} – ${request.maxPrice !== null ? formatCurrency(request.maxPrice, "XCG") : "Any"}`
                  : "Not specified"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Bedrooms</dt>
              <dd className="font-medium">
                {request.minBedrooms !== null
                  ? `${request.minBedrooms}+`
                  : "Not specified"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Locations</dt>
              <dd className="font-medium">
                {request.preferredNeighbourhoods.join(", ") || "Any"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Types</dt>
              <dd className="font-medium">
                {request.propertyTypes.join(", ") || "Any"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Must-haves</dt>
              <dd className="font-medium">
                {request.mustHaves.join(", ") || "None"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Preferences</dt>
              <dd className="font-medium">
                {request.preferences.join(", ") || "None"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Renovation</dt>
              <dd className="font-medium">
                {titleCase(request.renovationWillingness ?? "unknown")}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Notes</dt>
              <dd className="font-medium">{request.notes ?? "None"}</dd>
            </div>
          </dl>
        )}
        {message ? (
          <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
