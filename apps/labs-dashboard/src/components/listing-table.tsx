import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Eye,
  History,
  ImageOff,
  MoreHorizontal,
  Rows3,
} from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
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
import type { PropertyListing } from "@/lib/domain/types";
import {
  formatCurrency,
  formatDate,
  titleCase,
} from "@/lib/format";
import { TIPS } from "@/lib/ui-labels";

function HeadWithTip({
  children,
  tip,
  tipLabel,
  className,
}: {
  children: React.ReactNode;
  tip: string;
  tipLabel: string;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <span className="inline-flex items-center gap-1">
        {children}
        <HelpTip label={tipLabel}>{tip}</HelpTip>
      </span>
    </TableHead>
  );
}

export function ListingTable({
  listings,
}: {
  listings: PropertyListing[];
}) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <Table className="min-w-[720px] [&_td]:px-4 [&_td]:py-3 [&_th]:px-4">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[220px] sm:min-w-[280px]">
              Listing
            </TableHead>
            <TableHead>Original realtor</TableHead>
            <TableHead>Neighbourhood</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <HeadWithTip
              tip={TIPS.completeness.tip}
              tipLabel={TIPS.completeness.label}
            >
              Completeness
            </HeadWithTip>
            <HeadWithTip tip={TIPS.timesSeen.tip} tipLabel={TIPS.timesSeen.label}>
              Activity
            </HeadWithTip>
            <HeadWithTip tip={TIPS.observed.tip} tipLabel={TIPS.observed.label}>
              Last seen
            </HeadWithTip>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listings.map((listing, index) => {
            const title = listing.title ?? `Listing ${listing.externalId}`;

            return (
              <TableRow key={listing.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/listings/${listing.id}`}
                      className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md border bg-muted"
                      aria-label={`View ${title}`}
                    >
                      {listing.primaryImageUrl ? (
                        <Image
                          src={listing.primaryImageUrl}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="80px"
                          priority={index === 0}
                          unoptimized
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center text-muted-foreground">
                          <ImageOff className="size-4" aria-hidden />
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0">
                      <Link
                        href={`/listings/${listing.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {title}
                      </Link>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        #{listing.externalId}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="min-w-[160px]">
                  <div className="space-y-1">
                    <p className="text-sm">
                      {listing.originalRealtorName ?? "Realtor not listed"}
                    </p>
                    {listing.originalRealtorDomain ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {listing.originalRealtorDomain}
                      </p>
                    ) : null}
                    {listing.unresolvedConflictCount > 0 ? (
                      <Badge variant="outline">Needs review</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="min-w-[180px]">
                  <div className="space-y-1">
                    <p className="whitespace-nowrap text-sm">
                      {listing.neighbourhood?.name ?? "Not specified"}
                    </p>
                    {listing.inferredNeighbourhood ? (
                      <p className="text-xs text-muted-foreground">
                        From map: {listing.inferredNeighbourhood.name}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {titleCase(listing.listingType)}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono font-medium">
                  {formatCurrency(listing.currentPrice, listing.currency)}
                </TableCell>
                <TableCell>
                  {listing.dataCompletenessScore !== null ? (
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"
                        role="presentation"
                      >
                        <div
                          className={
                            listing.dataCompletenessScore >= 70
                              ? "h-full rounded-full bg-emerald-500"
                              : listing.dataCompletenessScore >= 40
                                ? "h-full rounded-full bg-amber-500"
                                : "h-full rounded-full bg-red-500"
                          }
                          style={{
                            width: `${Math.min(100, Math.max(0, listing.dataCompletenessScore))}%`,
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {listing.dataCompletenessScore}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="size-3.5" aria-hidden />
                      Seen {listing.observationCount}×
                    </span>
                    <span className="flex items-center gap-1">
                      <History className="size-3.5" aria-hidden />
                      {listing.priceObservationCount} price
                      {listing.priceObservationCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(listing.lastSeenAt)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${title}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel>Listing actions</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link href={`/listings/${listing.id}`}>
                          <Rows3 className="size-4" />
                          View details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <a
                          href={listing.originalRealtorUrl ?? listing.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ArrowUpRight className="size-4" />
                          Open original ad
                        </a>
                      </DropdownMenuItem>
                      {listing.originalRealtorUrl ? (
                        <DropdownMenuItem asChild>
                          <a
                            href={listing.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ArrowUpRight className="size-4" />
                            Open other listing page
                          </a>
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
