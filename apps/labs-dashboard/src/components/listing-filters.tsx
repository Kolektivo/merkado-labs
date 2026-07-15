"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";

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

type Options = {
  neighbourhoods: [string, string][];
  listingTypes: string[];
  currencies: string[];
  coordinateQualities?: readonly (readonly [string, string])[];
  assignmentStatuses?: readonly (readonly [string, string])[];
};

type DraftFilters = {
  q: string;
  neighbourhood: string;
  type: string;
  currency: string;
  minPrice: string;
  maxPrice: string;
  coordQuality: string;
  assignment: string;
  sort: string;
};

const DRAFT_KEYS = [
  "q",
  "neighbourhood",
  "type",
  "currency",
  "minPrice",
  "maxPrice",
  "coordQuality",
  "assignment",
  "sort",
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

  // Keep the staged values in sync when the URL changes from outside this
  // form (back/forward navigation, the Clear button, links).
  useEffect(() => {
    setDraft(draftFromParams(searchParams));
  }, [searchParams]);

  const isDirty = draftToQueryString(draft) !== appliedQuery;
  const hasActiveFilters = appliedQuery.length > 0;

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
  }

  function clearAll() {
    setDraft(draftFromParams(new URLSearchParams()));
    router.push(basePath);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Find listings</CardTitle>
        <CardDescription>
          Choose your filters, then press Apply to update the results. Pick one
          currency before using a price range.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={apply} className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
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
            <Select
              value={draft.neighbourhood || "__all"}
              onValueChange={(value) =>
                update({ neighbourhood: value === "__all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full" aria-label="Neighbourhood">
                <SelectValue placeholder="All neighbourhoods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All neighbourhoods</SelectItem>
                {options.neighbourhoods.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={draft.type || "__all"}
              onValueChange={(value) =>
                update({ type: value === "__all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full" aria-label="Listing type">
                <SelectValue placeholder="All listing types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All listing types</SelectItem>
                {options.listingTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={draft.currency || "__all"}
              onValueChange={(value) =>
                update({ currency: value === "__all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full" aria-label="Currency">
                <SelectValue placeholder="All currencies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All currencies</SelectItem>
                {options.currencies.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              aria-label="Minimum price"
              type="number"
              min="0"
              value={draft.minPrice}
              onChange={(event) => update({ minPrice: event.target.value })}
              placeholder={
                draft.currency
                  ? `Min ${draft.currency}`
                  : "Select currency first"
              }
              disabled={!draft.currency}
            />
            <Input
              aria-label="Maximum price"
              type="number"
              min="0"
              value={draft.maxPrice}
              onChange={(event) => update({ maxPrice: event.target.value })}
              placeholder={
                draft.currency
                  ? `Max ${draft.currency}`
                  : "Select currency first"
              }
              disabled={!draft.currency}
            />
            {showGeoFilters ? (
              <>
                <Select
                  value={draft.coordQuality || "__all"}
                  onValueChange={(value) =>
                    update({ coordQuality: value === "__all" ? "" : value })
                  }
                >
                  <SelectTrigger className="w-full" aria-label="Coordinate quality">
                    <SelectValue placeholder="Coordinate quality" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All coordinate quality</SelectItem>
                    {(options.coordinateQualities ?? []).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={draft.assignment || "__all"}
                  onValueChange={(value) =>
                    update({ assignment: value === "__all" ? "" : value })
                  }
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label="Neighbourhood assignment"
                  >
                    <SelectValue placeholder="Assignment status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All assignment statuses</SelectItem>
                    {(options.assignmentStatuses ?? []).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {showSort ? (
              <Select
                value={draft.sort || "recent"}
                onValueChange={(value) =>
                  update({ sort: value === "recent" ? "" : value })
                }
              >
                <SelectTrigger className="w-full sm:w-[220px]" aria-label="Sort listings">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Most recent</SelectItem>
                  <SelectItem value="oldest">Oldest observed</SelectItem>
                  <SelectItem value="price-asc">Price: low to high</SelectItem>
                  <SelectItem value="price-desc">Price: high to low</SelectItem>
                  <SelectItem value="title">Title A–Z</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <Button type="submit">
              <SlidersHorizontal className="size-4" />
              Apply
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={clearAll}
              disabled={!hasActiveFilters && !isDirty}
            >
              Clear
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
  );
}
