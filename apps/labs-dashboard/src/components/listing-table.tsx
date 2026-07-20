import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ImageOff, MoreHorizontal, Rows3 } from "lucide-react";

import { EffectiveNeighbourhoodBadge } from "@/components/effective-neighbourhood";
import { PriceDisplay } from "@/components/price-display";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listingDetailHref } from "@/lib/breadcrumbs";
import { resolveEffectiveNeighbourhood } from "@/lib/domain/effective-neighbourhood";
import { buildPriceDisplay } from "@/lib/domain/price-display";
import type { PropertyListing } from "@/lib/domain/types";
import { formatDate, titleCase } from "@/lib/format";
import {
  enrichmentStatusLabel,
  enrichmentStatusTone,
  lifecycleLabel,
  lifecycleTone,
} from "@/lib/ui-labels";

type DetailContext = {
  from?: string;
  fromId?: string;
  returnTo?: string;
};

function ListingActions({
  listing,
  detailHref,
  title,
}: {
  listing: PropertyListing;
  detailHref: string;
  title: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Listing actions</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={detailHref}>
              <Rows3 />
              View property
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <a
              href={listing.originalRealtorUrl ?? listing.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ArrowUpRight />
              Open original ad
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ListingImage({
  listing,
  title,
  priority,
}: {
  listing: PropertyListing;
  title: string;
  priority?: boolean;
}) {
  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted md:h-12 md:w-20">
      {listing.primaryImageUrl ? (
        <Image
          src={listing.primaryImageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="80px"
          priority={priority}
          unoptimized
        />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          <ImageOff className="size-4" aria-hidden />
          <span className="sr-only">No image for {title}</span>
        </span>
      )}
    </div>
  );
}

export function ListingTable({
  listings,
  detailContext,
}: {
  listings: PropertyListing[];
  detailContext?: DetailContext;
}) {
  return (
    <>
      <div
        className="divide-y md:hidden"
        data-testid="listing-mobile-results"
      >
        {listings.map((listing, index) => {
          const title = listing.title ?? "Untitled property";
          const detailHref = listingDetailHref(listing.id, detailContext);
          const effective = resolveEffectiveNeighbourhood({
            sourceName:
              listing.sourceNeighbourhoodText ?? listing.neighbourhood?.name ?? null,
            mapName: listing.inferredNeighbourhood?.name ?? null,
          });
          return (
            <article key={listing.id} className="flex flex-col gap-3 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <Link href={detailHref} aria-label={`Open ${title}`}>
                  <ListingImage listing={listing} title={title} priority={index === 0} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={detailHref}
                      className="line-clamp-2 font-medium leading-snug hover:underline"
                    >
                      {title}
                    </Link>
                    <ListingActions
                      listing={listing}
                      detailHref={detailHref}
                      title={title}
                    />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {listing.source.name}
                  </p>
                </div>
              </div>
              <PriceDisplay
                model={buildPriceDisplay({
                  originalPrice: listing.originalPrice ?? listing.currentPrice,
                  originalCurrency: listing.originalCurrency ?? listing.currency,
                  benchmarkPriceXcg: listing.benchmarkPriceXcg,
                  listingStatus: listing.status,
                })}
                size="sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{titleCase(listing.listingType)}</Badge>
                <StatusBadge tone={lifecycleTone(listing.status)}>
                  {lifecycleLabel(listing.status)}
                </StatusBadge>
                {listing.unresolvedConflictCount > 0 ? (
                  <StatusBadge tone="warning">Needs review</StatusBadge>
                ) : (
                  <StatusBadge
                    tone={enrichmentStatusTone(
                      listing.enrichmentStatus ?? "not_run",
                    )}
                  >
                    {enrichmentStatusLabel(listing.enrichmentStatus ?? "not_run")}
                  </StatusBadge>
                )}
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="flex min-w-0 items-center gap-1 truncate">
                  <span className="truncate">
                    {effective.name ?? "Neighbourhood not specified"}
                  </span>
                  <EffectiveNeighbourhoodBadge effective={effective} />
                </span>
                <span className="shrink-0">Updated {formatDate(listing.lastSeenAt)}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div
        className="hidden min-w-0 overflow-x-auto md:block"
        data-testid="listing-desktop-results"
      >
        <Table className="min-w-[980px] [&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[280px]">Property</TableHead>
              <TableHead className="text-right">XCG price</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Neighbourhood</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Latest refresh</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listings.map((listing, index) => {
              const title = listing.title ?? "Untitled property";
              const detailHref = listingDetailHref(listing.id, detailContext);
              const effective = resolveEffectiveNeighbourhood({
                sourceName:
                  listing.sourceNeighbourhoodText ?? listing.neighbourhood?.name ?? null,
                mapName: listing.inferredNeighbourhood?.name ?? null,
              });
              return (
                <TableRow key={listing.id}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <Link href={detailHref} aria-label={`Open ${title}`}>
                        <ListingImage
                          listing={listing}
                          title={title}
                          priority={index === 0}
                        />
                      </Link>
                      <div className="min-w-0">
                        <Link
                          href={detailHref}
                          className="line-clamp-2 font-medium hover:underline"
                        >
                          {title}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {titleCase(listing.propertyType)}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <PriceDisplay
                      model={buildPriceDisplay({
                        originalPrice:
                          listing.originalPrice ?? listing.currentPrice,
                        originalCurrency:
                          listing.originalCurrency ?? listing.currency,
                        benchmarkPriceXcg: listing.benchmarkPriceXcg,
                        listingStatus: listing.status,
                      })}
                      size="sm"
                      align="end"
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {titleCase(listing.listingType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-[170px]">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm">
                        {effective.name ?? "Not specified"}
                      </span>
                      <EffectiveNeighbourhoodBadge effective={effective} />
                    </div>
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-sm">
                    {listing.source.name}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={lifecycleTone(listing.status)}>
                      {lifecycleLabel(listing.status)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {listing.unresolvedConflictCount > 0 ? (
                      <StatusBadge tone="warning">Needs review</StatusBadge>
                    ) : (
                      <StatusBadge
                        tone={enrichmentStatusTone(
                          listing.enrichmentStatus ?? "not_run",
                        )}
                      >
                        {enrichmentStatusLabel(
                          listing.enrichmentStatus ?? "not_run",
                        )}
                      </StatusBadge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(listing.lastSeenAt)}
                  </TableCell>
                  <TableCell>
                    <ListingActions
                      listing={listing}
                      detailHref={detailHref}
                      title={title}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
