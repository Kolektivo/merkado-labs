"use client";

import { useMemo, useState } from "react";
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
  sources?: [string, string][];
  neighbourhoods: [string, string][];
  listingTypes: string[];
  currencies: string[];
  realtors?: string[];
  amenities?: string[];
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
  publicEligible: string;
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
  "publicEligible",
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
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle>Find listings</CardTitle>
        <CardDescription>
          Choose your filters, then press Apply to update the results. Pick one
          currency before using a price range.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={apply} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
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
              value={draft.source || "__all"}
              onValueChange={(value) =>
                update({ source: value === "__all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full" aria-label="Source">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All sources</SelectItem>
                {(options.sources ?? []).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Select
              value={draft.publicEligible || "__all"}
              onValueChange={(value) =>
                update({ publicEligible: value === "__all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full" aria-label="Public eligibility">
                <SelectValue placeholder="Public eligibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All eligibility states</SelectItem>
                <SelectItem value="eligible">Public eligible</SelectItem>
                <SelectItem value="excluded">Public excluded</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              value={draft.realtor || "__all"}
              onValueChange={(value) =>
                update({ realtor: value === "__all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full" aria-label="Original realtor">
                <SelectValue placeholder="All realtors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All realtors</SelectItem>
                {(options.realtors ?? []).map((realtor) => (
                  <SelectItem key={realtor} value={realtor}>
                    {realtor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={draft.amenity || "__all"}
              onValueChange={(value) =>
                update({ amenity: value === "__all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full" aria-label="Amenity">
                <SelectValue placeholder="All amenities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All amenities</SelectItem>
                {(options.amenities ?? []).map((amenity) => (
                  <SelectItem key={amenity} value={amenity}>
                    {amenity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={draft.attribution || "__all"}
              onValueChange={(value) =>
                update({ attribution: value === "__all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full" aria-label="Attribution status">
                <SelectValue placeholder="Attribution status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All attribution statuses</SelectItem>
                <SelectItem value="attributed">Has original realtor</SelectItem>
                <SelectItem value="missing">Missing attribution</SelectItem>
                <SelectItem value="conflicts">Has source conflicts</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={draft.enrichment || "__all"}
              onValueChange={(value) =>
                update({ enrichment: value === "__all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full" aria-label="Enrichment status">
                <SelectValue placeholder="Enrichment status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All enrichment statuses</SelectItem>
                <SelectItem value="not_run">Not run</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="skipped_unchanged">Skipped unchanged</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="needs_review">Needs review</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={draft.lifecycle || "__all"}
              onValueChange={(value) =>
                update({ lifecycle: value === "__all" ? "" : value })
              }
            >
              <SelectTrigger className="w-full" aria-label="Lifecycle">
                <SelectValue placeholder="Lifecycle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All canonical statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="sold">Sold (source-marked sold)</SelectItem>
                <SelectItem value="inactive">Inactive (includes source rented)</SelectItem>
                <SelectItem value="missing">Missing (absent from complete run)</SelectItem>
                <SelectItem value="removed">Removed (confirmed absence)</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
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
