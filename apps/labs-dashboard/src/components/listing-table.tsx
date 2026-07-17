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
            <TableHead className="min-w-[220px] sm:min-w-[280px]">Listing</TableHead>
            <TableHead>Original realtor</TableHead>
            <TableHead>Neighbourhood</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead>Completeness</TableHead>
            <TableHead>Evidence</TableHead>
            <TableHead>Observed</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Source</span>
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
                      {listing.originalRealtorName ?? "Missing attribution"}
                    </p>
                    {listing.originalRealtorDomain ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {listing.originalRealtorDomain}
                      </p>
                    ) : null}
                    {listing.unresolvedConflictCount > 0 ? (
                      <Badge variant="outline">Conflict</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="min-w-[180px]">
                  <div className="space-y-1">
                    <p className="whitespace-nowrap text-sm">
                      {listing.neighbourhood?.name ?? "Unspecified"}
                    </p>
                    {listing.inferredNeighbourhood ? (
                      <p className="text-xs text-muted-foreground">
                        Geo: {listing.inferredNeighbourhood.name}
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
                  <span className="font-mono text-sm tabular-nums">
                    {listing.dataCompletenessScore !== null
                      ? `${listing.dataCompletenessScore}%`
                      : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3 whitespace-nowrap text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="size-3.5" />
                      {listing.observationCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <History className="size-3.5" />
                      {listing.priceObservationCount}
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
                          Open original source
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
                            Open aggregator record
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
