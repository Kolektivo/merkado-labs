"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";

import { FieldLabel } from "@/components/field-label";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";
import { exclusionReasonLabel, TIPS } from "@/lib/ui-labels";

type Options = {
  sources?: [string, string][];
  neighbourhoods: [string, string][];
  listingTypes: string[];
  currencies: string[];
  realtors?: string[];
  amenities?: string[];
  exclusionReasons?: string[];
  coordinateQualities?: readonly (readonly [string, string])[];
  assignmentStatuses?: readonly (readonly [string, string])[];
};

type DraftFilters = {
  view: string;
  q: string;
  source: string;
  neighbourhood: string;
  type: string;
  currency: string;
  realtor: string;
  amenity: string;
  attribution: string;
  enrichment: string;
  lifecycle: string;
  minPrice: string;
  maxPrice: string;
  coordQuality: string;
  assignment: string;
  locationGap: string;
  publicEligible: string;
  exclusion: string;
  priceAvailability: string;
  sort: string;
};

const DRAFT_KEYS = [
  "view",
  "q",
  "source",
  "neighbourhood",
  "type",
  "currency",
  "realtor",
  "amenity",
  "attribution",
  "enrichment",
  "lifecycle",
  "minPrice",
  "maxPrice",
  "coordQuality",
  "assignment",
  "locationGap",
  "publicEligible",
  "exclusion",
  "priceAvailability",
  "sort",
] as const;

/** Filters hidden behind the "More filters" toggle. */
const ADVANCED_KEYS = [
  "realtor",
  "amenity",
  "attribution",
  "enrichment",
  "lifecycle",
  "coordQuality",
  "assignment",
  "locationGap",
  "publicEligible",
  "exclusion",
  "priceAvailability",
] as const;

function draftFromParams(params: URLSearchParams): DraftFilters {
  const draft = {} as Record<(typeof DRAFT_KEYS)[number], string>;
  for (const key of DRAFT_KEYS) {
    draft[key] = params.get(key) ?? "";
  }
  return draft;
}

function draftToQueryString(draft: DraftFilters): string {
  const next = new URLSearchParams();
  for (const key of DRAFT_KEYS) {
    const value = draft[key].trim();
    if (!value) continue;
    if (key === "sort" && value === "recent") continue;
    if ((key === "minPrice" || key === "maxPrice") && !draft.currency) continue;
    next.set(key, value);
  }
  return next.toString();
}

function countAdvanced(draft: DraftFilters) {
  return ADVANCED_KEYS.filter((key) => draft[key].trim()).length;
}

function SelectFilter({
  label,
  tip,
  tipLabel,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  tip?: string;
  tipLabel?: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0">
      <FieldLabel tip={tip} tipLabel={tipLabel}>
        {label}
      </FieldLabel>
      <Select
        value={value || "__all"}
        onValueChange={(next) => onChange(next === "__all" ? "" : next)}
      >
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ListingFilters({
  options,
  basePath = "/listings",
  showGeoFilters = true,
  showSort = true,
}: {
  options: Options;
  basePath?: string;
  showGeoFilters?: boolean;
  showSort?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appliedQuery = useMemo(
    () => draftToQueryString(draftFromParams(searchParams)),
    [searchParams],
  );

  const [draft, setDraft] = useState<DraftFilters>(() =>
    draftFromParams(searchParams),
  );
  const [showAdvanced, setShowAdvanced] = useState(
    () => countAdvanced(draftFromParams(searchParams)) > 0,
  );
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const isDirty = draftToQueryString(draft) !== appliedQuery;
  const hasActiveFilters = Array.from(searchParams.keys()).some(
    (key) => key !== "view" && key !== "page",
  );
  const advancedCount = countAdvanced(draft);

  function update(patch: Partial<DraftFilters>) {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (!next.currency) {
        next.minPrice = "";
        next.maxPrice = "";
      }
      return next;
    });
  }

  function apply(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const query = draftToQueryString(draft);
    router.push(query ? `${basePath}?${query}` : basePath);
    setMobileFiltersOpen(false);
  }

  function clearAll() {
    const cleared = new URLSearchParams();
    const view = searchParams.get("view");
    if (view) cleared.set("view", view);
    setDraft(draftFromParams(cleared));
    const query = cleared.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:hidden">
        <form onSubmit={apply} className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search listings"
              value={draft.q}
              onChange={(event) => update({ q: event.target.value })}
              placeholder="Search listings"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {hasActiveFilters
              ? `${Array.from(searchParams.keys()).filter((key) => !["view", "page"].includes(key)).length} filters active`
              : "No filters applied"}
          </p>
          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline">
                <SlidersHorizontal data-icon="inline-start" />
                Filters
                {hasActiveFilters ? (
                  <Badge variant="secondary">
                    {
                      Array.from(searchParams.keys()).filter(
                        (key) => !["view", "page"].includes(key),
                      ).length
                    }
                  </Badge>
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(92vw,420px)] overflow-y-auto"
            >
              <SheetHeader>
                <SheetTitle>Filter listings</SheetTitle>
                <SheetDescription>
                  Narrow the results, then apply your choices.
                </SheetDescription>
              </SheetHeader>
              <form onSubmit={apply} className="flex flex-col gap-4 px-4 pb-6">
                <SelectFilter
                  label="Website"
                  value={draft.source}
                  onChange={(value) => update({ source: value })}
                  allLabel="All websites"
                  options={(options.sources ?? []).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
                <SelectFilter
                  label="Neighbourhood"
                  value={draft.neighbourhood}
                  onChange={(value) => update({ neighbourhood: value })}
                  allLabel="All neighbourhoods"
                  options={options.neighbourhoods.map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
                <SelectFilter
                  label="Listing type"
                  value={draft.type}
                  onChange={(value) => update({ type: value })}
                  allLabel="Buy or rent"
                  options={options.listingTypes.map((type) => ({
                    value: type,
                    label:
                      type === "sale"
                        ? "For sale"
                        : type === "rent"
                          ? "For rent"
                          : titleCase(type),
                  }))}
                />
                <SelectFilter
                  label="Market status"
                  value={draft.lifecycle}
                  onChange={(value) => update({ lifecycle: value })}
                  allLabel="Any market status"
                  options={[
                    { value: "active", label: "Active" },
                    { value: "sold", label: "Sold" },
                    { value: "inactive", label: "Inactive" },
                    { value: "missing", label: "Missing after latest check" },
                    { value: "removed", label: "Removed from website" },
                  ]}
                />
                <SelectFilter
                  label="Public preview"
                  value={draft.publicEligible}
                  onChange={(value) => update({ publicEligible: value })}
                  allLabel="Any visibility"
                  options={[
                    { value: "eligible", label: "Visible in public preview" },
                    { value: "excluded", label: "Hidden from public preview" },
                  ]}
                />
                <SelectFilter
                  label="AI details"
                  value={draft.enrichment}
                  onChange={(value) => update({ enrichment: value })}
                  allLabel="Any AI status"
                  options={[
                    { value: "not_run", label: "Not run" },
                    { value: "succeeded", label: "Added" },
                    { value: "skipped_unchanged", label: "No changes — skipped" },
                    { value: "needs_review", label: "Needs review" },
                    { value: "failed", label: "Failed" },
                  ]}
                />
                <p className="border-t pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Data quality
                </p>
                <SelectFilter
                  label="Asking price"
                  value={draft.priceAvailability}
                  onChange={(value) => update({ priceAvailability: value })}
                  allLabel="Any price availability"
                  options={[
                    { value: "available", label: "Has a usable price" },
                    { value: "missing", label: "Missing or unusable price" },
                  ]}
                />
                <SelectFilter
                  label="Realtor info"
                  tip={TIPS.attribution.tip}
                  tipLabel={TIPS.attribution.label}
                  value={draft.attribution}
                  onChange={(value) => update({ attribution: value })}
                  allLabel="Any realtor info"
                  options={[
                    { value: "attributed", label: "Has original realtor" },
                    { value: "missing", label: "Missing realtor name" },
                    { value: "conflicts", label: "Conflicting realtor info" },
                  ]}
                />
                <SelectFilter
                  label="Why hidden"
                  tip={TIPS.publicEligibility.tip}
                  tipLabel={TIPS.publicEligibility.label}
                  value={draft.exclusion}
                  onChange={(value) => update({ exclusion: value })}
                  allLabel="Any exclusion reason"
                  options={(options.exclusionReasons ?? []).map((reason) => ({
                    value: reason,
                    label: exclusionReasonLabel(reason),
                  }))}
                />
                <SelectFilter
                  label="Neighbourhood search"
                  tip={TIPS.missingNeighbourhoodSearch.tip}
                  tipLabel={TIPS.missingNeighbourhoodSearch.label}
                  value={draft.locationGap}
                  onChange={(value) => update({ locationGap: value })}
                  allLabel="Any search coverage"
                  options={[
                    {
                      value: "missing_neighbourhood",
                      label: "Missing from neighbourhood search",
                    },
                  ]}
                />
                {showGeoFilters ? (
                  <>
                    <SelectFilter
                      label="Map pin quality"
                      tip={TIPS.coordinateQuality.tip}
                      tipLabel={TIPS.coordinateQuality.label}
                      value={draft.coordQuality}
                      onChange={(value) => update({ coordQuality: value })}
                      allLabel="Any pin quality"
                      options={(options.coordinateQualities ?? []).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    />
                    <SelectFilter
                      label="Neighbourhood match"
                      tip={TIPS.assignmentStatus.tip}
                      tipLabel={TIPS.assignmentStatus.label}
                      value={draft.assignment}
                      onChange={(value) => update({ assignment: value })}
                      allLabel="Any neighbourhood match"
                      options={(options.assignmentStatuses ?? []).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    />
                  </>
                ) : null}
                {showSort ? (
                  <SelectFilter
                    label="Sort by"
                    value={draft.sort || "recent"}
                    onChange={(value) =>
                      update({ sort: value === "recent" ? "" : value })
                    }
                    allLabel="Most recently seen"
                    options={[
                      { value: "oldest", label: "Oldest first" },
                      { value: "price-asc", label: "Price: low to high" },
                      { value: "price-desc", label: "Price: high to low" },
                      { value: "title", label: "Title A–Z" },
                    ]}
                  />
                ) : null}
                <div className="sticky bottom-0 flex gap-2 border-t bg-background py-4">
                  <Button type="submit" className="flex-1">
                    Apply filters
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearAll}
                    disabled={!hasActiveFilters && !isDirty}
                  >
                    Clear
                  </Button>
                </div>
              </form>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card className="hidden min-w-0 md:flex">
      <CardHeader className="pb-3">
        <CardTitle>Find listings</CardTitle>
        <CardDescription>
          Search by property, place, source, or status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={apply} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
              <FieldLabel>Search</FieldLabel>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search listings"
                  value={draft.q}
                  onChange={(event) => update({ q: event.target.value })}
                  placeholder="Title, ID, or neighbourhood"
                  className="pl-9"
                />
              </div>
            </div>
            <SelectFilter
              label="Website"
              value={draft.source}
              onChange={(value) => update({ source: value })}
              allLabel="All websites"
              options={(options.sources ?? []).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <SelectFilter
              label="Neighbourhood"
              value={draft.neighbourhood}
              onChange={(value) => update({ neighbourhood: value })}
              allLabel="All neighbourhoods"
              options={options.neighbourhoods.map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <SelectFilter
              label="Listing type"
              value={draft.type}
              onChange={(value) => update({ type: value })}
              allLabel="All listing types"
              options={options.listingTypes.map((type) => ({
                value: type,
                label:
                  type === "sale"
                    ? "For sale"
                    : type === "rent"
                      ? "For rent"
                      : titleCase(type),
              }))}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectFilter
              label="Currency"
              value={draft.currency}
              onChange={(value) => update({ currency: value })}
              allLabel="All currencies"
              options={options.currencies.map((item) => ({
                value: item,
                label: item,
              }))}
            />
            <div className="min-w-0">
              <FieldLabel>Min price</FieldLabel>
              <Input
                aria-label="Minimum price"
                type="number"
                min="0"
                value={draft.minPrice}
                onChange={(event) => update({ minPrice: event.target.value })}
                placeholder={
                  draft.currency
                    ? `Min ${draft.currency}`
                    : "Pick a currency first"
                }
                disabled={!draft.currency}
              />
            </div>
            <div className="min-w-0">
              <FieldLabel>Max price</FieldLabel>
              <Input
                aria-label="Maximum price"
                type="number"
                min="0"
                value={draft.maxPrice}
                onChange={(event) => update({ maxPrice: event.target.value })}
                placeholder={
                  draft.currency
                    ? `Max ${draft.currency}`
                    : "Pick a currency first"
                }
                disabled={!draft.currency}
              />
            </div>
            {showSort ? (
              <SelectFilter
                label="Sort by"
                value={draft.sort || "recent"}
                onChange={(value) =>
                  update({ sort: value === "recent" ? "" : value })
                }
                allLabel="Most recently seen"
                options={[
                  { value: "oldest", label: "Oldest first" },
                  { value: "price-asc", label: "Price: low to high" },
                  { value: "price-desc", label: "Price: high to low" },
                  { value: "title", label: "Title A–Z" },
                ]}
              />
            ) : null}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
              className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={showAdvanced}
              aria-controls="listing-advanced-filters"
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  showAdvanced && "rotate-180",
                )}
              />
              More filters
              <span className="text-xs font-normal">
                (realtor, data quality, AI status)
              </span>
              {advancedCount > 0 ? (
                <Badge variant="secondary">{advancedCount} active</Badge>
              ) : null}
            </button>

            {showAdvanced ? (
              <div
                id="listing-advanced-filters"
                className="mt-3 grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                <SelectFilter
                  label="Original realtor"
                  value={draft.realtor}
                  onChange={(value) => update({ realtor: value })}
                  allLabel="All realtors"
                  options={(options.realtors ?? []).map((realtor) => ({
                    value: realtor,
                    label: realtor,
                  }))}
                />
                <SelectFilter
                  label="Amenity"
                  value={draft.amenity}
                  onChange={(value) => update({ amenity: value })}
                  allLabel="All amenities"
                  options={(options.amenities ?? []).map((amenity) => ({
                    value: amenity,
                    label: amenity,
                  }))}
                />
                <SelectFilter
                  label="Market status"
                  tip={TIPS.lifecycle.tip}
                  tipLabel={TIPS.lifecycle.label}
                  value={draft.lifecycle}
                  onChange={(value) => update({ lifecycle: value })}
                  allLabel="Any market status"
                  options={[
                    { value: "active", label: "Active (still listed)" },
                    { value: "sold", label: "Sold" },
                    { value: "inactive", label: "Inactive" },
                    {
                      value: "missing",
                      label: "Missing from latest full check",
                    },
                    { value: "removed", label: "Removed from website" },
                    { value: "unknown", label: "Unknown" },
                  ]}
                />
                <SelectFilter
                  label="Show publicly?"
                  tip={TIPS.publicEligibility.tip}
                  tipLabel={TIPS.publicEligibility.label}
                  value={draft.publicEligible}
                  onChange={(value) => update({ publicEligible: value })}
                  allLabel="Any visibility"
                  options={[
                    { value: "eligible", label: "OK to show publicly" },
                    { value: "excluded", label: "Hidden from public" },
                  ]}
                />
                <SelectFilter
                  label="Why hidden"
                  tip={TIPS.publicEligibility.tip}
                  tipLabel={TIPS.publicEligibility.label}
                  value={draft.exclusion}
                  onChange={(value) => update({ exclusion: value })}
                  allLabel="Any exclusion reason"
                  options={(options.exclusionReasons ?? []).map((reason) => ({
                    value: reason,
                    label: exclusionReasonLabel(reason),
                  }))}
                />
                <SelectFilter
                  label="Asking price"
                  value={draft.priceAvailability}
                  onChange={(value) => update({ priceAvailability: value })}
                  allLabel="Any price availability"
                  options={[
                    { value: "available", label: "Has a usable price" },
                    { value: "missing", label: "Missing or unusable price" },
                  ]}
                />
                <SelectFilter
                  label="Realtor info"
                  tip={TIPS.attribution.tip}
                  tipLabel={TIPS.attribution.label}
                  value={draft.attribution}
                  onChange={(value) => update({ attribution: value })}
                  allLabel="Any realtor info"
                  options={[
                    { value: "attributed", label: "Has original realtor" },
                    { value: "missing", label: "Missing realtor name" },
                    { value: "conflicts", label: "Conflicting realtor info" },
                  ]}
                />
                <SelectFilter
                  label="AI enrichment"
                  tip={TIPS.enrichmentStatus.tip}
                  tipLabel={TIPS.enrichmentStatus.label}
                  value={draft.enrichment}
                  onChange={(value) => update({ enrichment: value })}
                  allLabel="Any AI status"
                  options={[
                    { value: "not_run", label: "Not run yet" },
                    { value: "queued", label: "Queued" },
                    { value: "running", label: "Running" },
                    { value: "succeeded", label: "Succeeded" },
                    {
                      value: "skipped_unchanged",
                      label: "Skipped (nothing changed)",
                    },
                    { value: "failed", label: "Failed" },
                    { value: "needs_review", label: "Needs review" },
                  ]}
                />
                {showGeoFilters ? (
                  <>
                    <SelectFilter
                      label="Map pin quality"
                      tip={TIPS.coordinateQuality.tip}
                      tipLabel={TIPS.coordinateQuality.label}
                      value={draft.coordQuality}
                      onChange={(value) => update({ coordQuality: value })}
                      allLabel="Any pin quality"
                      options={(options.coordinateQualities ?? []).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    />
                    <SelectFilter
                      label="Neighbourhood match"
                      tip={TIPS.assignmentStatus.tip}
                      tipLabel={TIPS.assignmentStatus.label}
                      value={draft.assignment}
                      onChange={(value) => update({ assignment: value })}
                      allLabel="Any neighbourhood match"
                      options={(options.assignmentStatuses ?? []).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    />
                    <SelectFilter
                      label="Neighbourhood search"
                      tip={TIPS.missingNeighbourhoodSearch.tip}
                      tipLabel={TIPS.missingNeighbourhoodSearch.label}
                      value={draft.locationGap}
                      onChange={(value) => update({ locationGap: value })}
                      allLabel="Any search coverage"
                      options={[
                        {
                          value: "missing_neighbourhood",
                          label: "Missing from neighbourhood search",
                        },
                      ]}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="submit">
              <SlidersHorizontal className="size-4" />
              Apply filters
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={clearAll}
              disabled={!hasActiveFilters && !isDirty}
            >
              Clear all
            </Button>
            {isDirty ? (
              <p className="text-xs text-muted-foreground">
                You have unapplied changes — press Apply to update the results.
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
      </Card>
    </>
  );
}
