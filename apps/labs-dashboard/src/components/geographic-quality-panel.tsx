import Link from "next/link";

import { HelpTip } from "@/components/help-tip";
import type { GeographicQualitySummary } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const QUALITY_ITEMS: {
  key: keyof GeographicQualitySummary;
  label: string;
  hint: string;
  href?: string;
}[] = [
  {
    key: "missingCoords",
    label: "No map pin",
    hint: "Missing latitude/longitude only — the listing cannot appear on the map. This is not the same as a neighbourhood-search gap.",
    href: "/listings?coordQuality=missing_coords&from=quality",
  },
  {
    key: "missingNeighbourhoodSearch",
    label: "No neighbourhood for search",
    hint: "No usable area could be found from either the website or the map pin, so neighbourhood filters cannot place these listings.",
    href: "/listings?locationGap=missing_neighbourhood&from=quality",
  },
  {
    key: "invalidCoords",
    label: "Broken coordinates",
    hint: "The numbers look like coordinates but fall outside the real world ranges.",
    href: "/listings?coordQuality=invalid_coords&from=quality",
  },
  {
    key: "outsideCuracao",
    label: "Outside Curaçao",
    hint: "The pin is outside our Curaçao safety box. We still keep the original values.",
    href: "/listings?coordQuality=outside_curacao&from=quality",
  },
  {
    key: "sourceNeighbourhood",
    label: "Area from the website",
    hint: "Neighbourhood name came from the listing site. We never silently overwrite it. Present-but-uncanonicalized source text is still location evidence, not a missing-location gap.",
  },
  {
    key: "geographicallyInferred",
    label: "Area from the map",
    hint: "No area on the ad — we guessed it by dropping the pin onto official neighbourhood boundaries.",
    href: "/listings?assignment=inferred&from=quality",
  },
  {
    key: "matchedSourceAndGeography",
    label: "Website & map agree",
    hint: "The website’s neighbourhood matches the area under the map pin.",
    href: "/listings?assignment=matched&from=quality",
  },
  {
    key: "sourceGeographyConflict",
    label: "Website & map disagree",
    hint: "The website named one area, but the pin sits in another. We keep both so you can decide.",
    href: "/listings?assignment=conflict&from=quality",
  },
  {
    key: "outsideKnownPolygons",
    label: "No matching area",
    hint: "Valid Curaçao coordinates that do not fall inside a known neighbourhood shape.",
    href: "/listings?assignment=outside_polygons&from=quality",
  },
];

export function GeographicQualityPanel({
  summary,
}: {
  summary: GeographicQualitySummary;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Location health check</CardTitle>
        <CardDescription>
          Quick counts for {formatNumber(summary.totalListings)} listings. Open a
          card to see matching listings; use the help icons for definitions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUALITY_ITEMS.map((item) => {
            const content = (
              <div className="pointer-events-none">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {item.label}
                  </p>
                  <HelpTip
                    label={item.label}
                    className="pointer-events-auto relative z-10"
                  >
                    {item.hint}
                  </HelpTip>
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {formatNumber(summary[item.key])}
                </p>
              </div>
            );

            return (
              <div
                key={item.key}
                className="relative rounded-lg border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring"
              >
                {content}
                {item.href ? (
                  <Link
                    href={item.href}
                    className="absolute inset-0 z-0 rounded-lg outline-none"
                    aria-label={`${item.label}: ${formatNumber(summary[item.key])}. View matching listings`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
