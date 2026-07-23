"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";

import { FieldLabel } from "@/components/field-label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { EXAMPLE_PROMPTS } from "@/lib/matching/parse-property-search";
import type { PropertySearchCriteria } from "@/lib/matching/types";

type PreviewMatch = {
  listingId: string;
  externalId: string;
  title: string | null;
  matchLabel: string | null;
  matchScore: number;
  matchReasons: string[];
  tradeOffs: string[];
  missingInformation: string[];
  neighbourhood: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  listingType: string | null;
  priceXcgLabel: string;
  foreignPriceLabel: string | null;
  sourceDisplayName: string | null;
  primaryImageUrl: string | null;
  passportHref: string;
};

type PreviewResponse = {
  criteria: PropertySearchCriteria;
  inventoryCount: number;
  matchCount: number;
  matches: PreviewMatch[];
  adjustmentSuggestions: string[];
};

type Step = "input" | "review" | "matches";

function listToInput(values: string[]): string {
  return values.join(", ");
}

function inputToList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function CriteriaEditor({
  criteria,
  onChange,
  disabled,
}: {
  criteria: PropertySearchCriteria;
  onChange: (next: PropertySearchCriteria) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof PropertySearchCriteria>(
    key: K,
    value: PropertySearchCriteria[K],
  ) => onChange({ ...criteria, [key]: value });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FieldLabel htmlFor="wfm-title">Property Search name</FieldLabel>
        <Input
          id="wfm-title"
          value={criteria.title}
          disabled={disabled}
          onChange={(event) => set("title", event.target.value)}
        />
      </div>
      <div>
        <FieldLabel>Buy or rent</FieldLabel>
        <Select
          value={criteria.transactionType}
          disabled={disabled}
          onValueChange={(value) =>
            set("transactionType", value as PropertySearchCriteria["transactionType"])
          }
        >
          <SelectTrigger className="w-full" aria-label="Buy or rent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sale">Buy</SelectItem>
            <SelectItem value="rent">Rent</SelectItem>
            <SelectItem value="either">Either</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <FieldLabel>Renovation willingness</FieldLabel>
        <Select
          value={criteria.renovationWillingness}
          disabled={disabled}
          onValueChange={(value) =>
            set(
              "renovationWillingness",
              value as PropertySearchCriteria["renovationWillingness"],
            )
          }
        >
          <SelectTrigger className="w-full" aria-label="Renovation willingness">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unknown">Not sure</SelectItem>
            <SelectItem value="none">Move-in ready only</SelectItem>
            <SelectItem value="light">Light work</SelectItem>
            <SelectItem value="moderate">Moderate work</SelectItem>
            <SelectItem value="major">Major work</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <FieldLabel htmlFor="wfm-min-price">Minimum budget (XCG)</FieldLabel>
        <Input
          id="wfm-min-price"
          type="number"
          min={0}
          disabled={disabled}
          value={criteria.minPrice ?? ""}
          onChange={(event) =>
            set(
              "minPrice",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        />
      </div>
      <div>
        <FieldLabel htmlFor="wfm-max-price">Maximum budget (XCG)</FieldLabel>
        <Input
          id="wfm-max-price"
          type="number"
          min={0}
          disabled={disabled}
          value={criteria.maxPrice ?? ""}
          onChange={(event) =>
            set(
              "maxPrice",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        />
      </div>
      <div>
        <FieldLabel htmlFor="wfm-beds">Minimum bedrooms</FieldLabel>
        <Input
          id="wfm-beds"
          type="number"
          min={0}
          disabled={disabled}
          value={criteria.minBedrooms ?? ""}
          onChange={(event) =>
            set(
              "minBedrooms",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        />
      </div>
      <div>
        <FieldLabel htmlFor="wfm-baths">Minimum bathrooms</FieldLabel>
        <Input
          id="wfm-baths"
          type="number"
          min={0}
          step={0.5}
          disabled={disabled}
          value={criteria.minBathrooms ?? ""}
          onChange={(event) =>
            set(
              "minBathrooms",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        />
      </div>
      <div>
        <FieldLabel htmlFor="wfm-types">Property types</FieldLabel>
        <Input
          id="wfm-types"
          disabled={disabled}
          placeholder="house, villa, apartment"
          value={listToInput(criteria.propertyTypes)}
          onChange={(event) => set("propertyTypes", inputToList(event.target.value))}
        />
      </div>
      <div>
        <FieldLabel htmlFor="wfm-floor">Minimum floor area (m²)</FieldLabel>
        <Input
          id="wfm-floor"
          type="number"
          min={0}
          disabled={disabled}
          value={criteria.minFloorAreaM2 ?? ""}
          onChange={(event) =>
            set(
              "minFloorAreaM2",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        />
      </div>
      <div className="sm:col-span-2">
        <FieldLabel htmlFor="wfm-locations">
          Required locations
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Hard requirement
          </span>
        </FieldLabel>
        <Input
          id="wfm-locations"
          disabled={disabled}
          placeholder="Jan Thiel, Brakkeput"
          value={listToInput(criteria.preferredNeighbourhoods)}
          onChange={(event) =>
            set("preferredNeighbourhoods", inputToList(event.target.value))
          }
        />
      </div>
      <div>
        <FieldLabel htmlFor="wfm-must">
          Must-haves
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Stronger preference
          </span>
        </FieldLabel>
        <Input
          id="wfm-must"
          disabled={disabled}
          placeholder="pool"
          value={listToInput(criteria.mustHaves)}
          onChange={(event) => set("mustHaves", inputToList(event.target.value))}
        />
      </div>
      <div>
        <FieldLabel htmlFor="wfm-prefs">
          Preferences
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Soft
          </span>
        </FieldLabel>
        <Input
          id="wfm-prefs"
          disabled={disabled}
          placeholder="parking, garden"
          value={listToInput(criteria.preferences)}
          onChange={(event) => set("preferences", inputToList(event.target.value))}
        />
      </div>
      <div className="sm:col-span-2">
        <FieldLabel htmlFor="wfm-deals">Dealbreakers</FieldLabel>
        <Input
          id="wfm-deals"
          disabled={disabled}
          placeholder="waterfront"
          value={listToInput(criteria.dealbreakers)}
          onChange={(event) => set("dealbreakers", inputToList(event.target.value))}
        />
      </div>
      {criteria.unclear.length ? (
        <Alert className="sm:col-span-2">
          <AlertTitle>Unclear or unsupported</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-4">
              {criteria.unclear.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function MatchCard({ match }: { match: PreviewMatch }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
        <div className="relative min-h-40 bg-muted sm:min-h-full">
          {match.primaryImageUrl ? (
            <Image
              src={match.primaryImageUrl}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 180px"
              unoptimized
            />
          ) : (
            <div className="flex h-full min-h-40 items-center justify-center text-xs text-muted-foreground">
              No photo
            </div>
          )}
        </div>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <Link
                href={match.passportHref}
                className="font-medium underline-offset-2 hover:underline"
              >
                {match.title ?? "Listing"}
              </Link>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {match.neighbourhood ?? "Location not listed"}
                </span>
                {match.bedrooms !== null ? (
                  <span>{match.bedrooms} bed</span>
                ) : null}
                {match.propertyType ? <span>{match.propertyType}</span> : null}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">{match.priceXcgLabel}</p>
              {match.foreignPriceLabel ? (
                <p className="text-xs text-muted-foreground">
                  Source: {match.foreignPriceLabel}
                </p>
              ) : null}
              <Badge variant="secondary" className="mt-1">
                {match.matchLabel ?? "Possible match"}
              </Badge>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Why it fits
              </p>
              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                {match.matchReasons.slice(0, 4).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            {match.tradeOffs.length ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Trade-offs
                </p>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {match.tradeOffs.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {match.missingInformation.length ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Missing information
                </p>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {match.missingInformation.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Source: {match.sourceDisplayName ?? "Listing source"}
              {" · "}
              <Link href={match.passportHref} className="underline underline-offset-2">
                Open Passport
              </Link>
            </p>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

function MatchSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-40 animate-pulse rounded-xl border bg-muted/50"
        />
      ))}
    </div>
  );
}

export function WhatFitsMeFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [criteria, setCriteria] = useState<PropertySearchCriteria | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPreview(nextCriteria?: PropertySearchCriteria) {
    setBusy(true);
    setError(null);
    try {
      const body = nextCriteria
        ? { criteria: nextCriteria, limit: 5 }
        : { text, limit: 5 };
      const response = await fetch("/api/what-fits-me/preview", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as PreviewResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to find matches.");
      }
      setCriteria(result.criteria);
      setPreview(result);
      setStep(nextCriteria ? "matches" : "review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to find matches.");
    } finally {
      setBusy(false);
    }
  }

  async function findMatchesFromCriteria() {
    if (!criteria) return;
    setStep("matches");
    await runPreview(criteria);
  }

  async function createPropertySearch() {
    if (!criteria) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/search-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...criteria,
          intakeSource: "what_fits_me",
          confirm: true,
          persistMatches: true,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to create Property Search.");
      }
      router.push(`/match-reports/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create Property Search.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {step !== "input" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setError(null);
            if (step === "matches") setStep("review");
            else setStep("input");
          }}
        >
          <ArrowLeft data-icon="inline-start" />
          {step === "matches" ? "Adjust search" : "Back to request"}
        </Button>
      ) : null}

      {step === "input" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5" />
              Tell us what you are looking for
            </CardTitle>
            <CardDescription>
              Write freely in English or Dutch. We turn it into editable Property
              Search criteria and match against current Labs listings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              placeholder={EXAMPLE_PROMPTS[0]}
              className="min-h-36 text-base"
              disabled={busy}
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setText(prompt)}
                  className="h-auto max-w-full whitespace-normal px-3 py-2 text-left text-xs"
                >
                  {prompt}
                </Button>
              ))}
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Could not interpret request</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() => void runPreview()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {busy ? "Interpreting…" : "Interpret & review criteria"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === "review" && criteria ? (
        <Card>
          <CardHeader>
            <CardTitle>Review Property Search criteria</CardTitle>
            <CardDescription>
              Hard requirements exclude mismatches. Preferences improve ranking
              when evidenced on the listing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CriteriaEditor
              criteria={criteria}
              onChange={setCriteria}
              disabled={busy}
            />
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() => void findMatchesFromCriteria()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                {busy ? "Matching…" : "Find matching properties"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "matches" ? (
        <div className="space-y-4">
          {busy || !preview ? (
            <MatchSkeleton />
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Your matches</CardTitle>
                  <CardDescription>
                    {preview.matchCount === 0
                      ? `No current matches in ${preview.inventoryCount} public-eligible listings.`
                      : `Showing ${preview.matches.length} of ${preview.matchCount} matches from ${preview.inventoryCount} public-eligible listings.`}
                  </CardDescription>
                </CardHeader>
              </Card>

              {preview.matches.length ? (
                <div className="space-y-3">
                  {preview.matches.map((match) => (
                    <MatchCard key={match.listingId} match={match} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="space-y-3 py-8">
                    <p className="font-medium">No properties match right now</p>
                    <p className="text-sm text-muted-foreground">
                      Try adjusting the most restrictive criteria:
                    </p>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground">
                      {preview.adjustmentSuggestions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep("review")}
                    >
                      Adjust search
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Would you like to create a Property Search based on these
                    criteria?
                  </CardTitle>
                  <CardDescription>
                    This saves your criteria and keeps the current matches so you
                    can reopen them later. Labs preview only — nothing is emailed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={saving || !criteria}
                    onClick={() => void createPropertySearch()}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    {saving ? "Saving…" : "Yes, create Property Search"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => setStep("review")}
                  >
                    Not yet — adjust criteria
                  </Button>
                </CardContent>
                {error ? (
                  <CardContent>
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </CardContent>
                ) : null}
              </Card>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
