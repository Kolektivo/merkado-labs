import Link from "next/link";

import { SearchX } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { Money } from "@/components/money-display";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SOLE_HOLDER_GATE } from "@/lib/rent-advance/copy";
import { statusLabel, statusTone } from "@/lib/rent-advance/helpers";
import { listMarketplaceCards } from "@/lib/rent-advance/store";
import type { ScoreBand } from "@/lib/rent-advance/scoring";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketplace" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const BANDS: ScoreBand[] = ["A", "B", "C", "D"];

function one(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const band = one(params, "band");
  const district = one(params, "district");
  const published = await listMarketplaceCards();
  const cards = published
    .filter((card) => (band ? card.passportBand === band : true))
    .filter((card) => (district ? card.district === district : true));
  const districts = [...new Set(published.map((card) => card.district))].sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketplace"
        description="District and grade only. No name, employer, street, or income."
      />
      <Alert>
        <AlertTitle className="flex items-center gap-2">
          Subscribe is closed
          <HelpTip label="Why subscribe is closed">{SOLE_HOLDER_GATE}</HelpTip>
        </AlertTitle>
        <AlertDescription>
          This is a walkthrough. Nobody can buy a position from this page.
        </AlertDescription>
      </Alert>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            Passport band
            <HelpTip label="Passport band">
              Property quality grade from A to D. Holders see the grade, not
              the street address.
            </HelpTip>
          </span>
          <select
            name="band"
            defaultValue={band}
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          >
            <option value="">All bands</option>
            {BANDS.map((value) => (
              <option key={value} value={value}>
                Band {value}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">District</span>
          <select
            name="district"
            defaultValue={district}
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          >
            <option value="">All districts</option>
            {districts.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">
          Apply
        </Button>
        {band || district ? (
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link href="/offers">Clear</Link>
          </Button>
        ) : null}
      </form>

      {cards.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No offers match these filters</EmptyTitle>
            <EmptyDescription>
              Try another band or district, or clear the filters.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.reference} className="flex flex-col">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={statusTone(card.status)}>
                    {statusLabel(card.status)}
                  </StatusBadge>
                  <StatusBadge tone="neutral">
                    Passport {card.passportScore} · {card.passportLabel}
                  </StatusBadge>
                </div>
                <CardTitle className="mt-2 text-lg">
                  {card.district} · {card.type} · {card.bedrooms} beds
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-2 text-sm">
                <p className="flex items-center gap-1.5">
                  Payer band {card.payerBand}
                  <HelpTip label="Payer band">
                    Payment-history grade. Holders never see the renter’s name.
                  </HelpTip>
                </p>
                <p className="flex items-center gap-1.5">
                  Rent-to-market {Math.round(card.rentToMarket * 100)}%
                  <HelpTip label="Rent-to-market">
                    Contract rent versus the local market estimate. Below 100%
                    means the rent is cheaper than nearby listings.
                  </HelpTip>
                </p>
                <p>{card.months} months</p>
                <p>
                  <Money cents={card.fundedCents} compact /> of{" "}
                  <Money cents={card.offeringCents} compact /> taken
                </p>
                <p className="text-xs text-muted-foreground">Via {card.agency}</p>
              </CardContent>
              <CardFooter>
                <Button asChild size="sm">
                  <Link href={`/offers/${card.reference}`}>View offer</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
