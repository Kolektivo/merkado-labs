import Link from "next/link";

import { SearchX } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { MarketplaceOfferCard } from "@/components/marketplace/marketplace-offer-card";
import { PageHeader } from "@/components/page-header";
import { ThemeMerkado } from "@/components/theme-merkado";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
    .filter((card) => (band ? card.propertyBand === band : true))
    .filter((card) => (district ? card.district === district : true));
  const districts = [...new Set(published.map((card) => card.district))].sort();

  return (
    <ThemeMerkado className="space-y-6">
      <PageHeader
        title="Marketplace"
        description="Open offers in Curaçao. Amounts in XCG."
      />

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            Combined property view
            <HelpTip label="Combined property view">
              A simple grade from Great to Weak. It already includes how the
              rent compares to typical nearby rent. Holders see the grade, not
              the street address.
            </HelpTip>
          </span>
          <select
            name="band"
            defaultValue={band}
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">All grades</option>
            {BANDS.map((value) => (
              <option key={value} value={value}>
                {value === "A"
                  ? "Great"
                  : value === "B"
                    ? "Strong"
                    : value === "C"
                      ? "Fair"
                      : "Weak"}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">District</span>
          <select
            name="district"
            defaultValue={district}
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">All districts</option>
            {districts.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" className="h-11">
          Apply
        </Button>
        {band || district ? (
          <Button type="button" variant="ghost" className="h-11" asChild>
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
              Try another grade or district, or clear the filters.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, index) => (
            <li key={card.reference} className="flex">
              <MarketplaceOfferCard card={card} priority={index === 0} />
            </li>
          ))}
        </ul>
      )}
    </ThemeMerkado>
  );
}
