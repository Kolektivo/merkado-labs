import type { GeographicQualitySummary } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
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
}[] = [
  {
    key: "missingCoords",
    label: "No map pin",
    hint: "The listing has no latitude/longitude, so it cannot appear on the map.",
  },
  {
    key: "invalidCoords",
    label: "Broken coordinates",
    hint: "The numbers look like coordinates but fall outside the real world ranges.",
  },
  {
    key: "outsideCuracao",
    label: "Outside Curaçao",
    hint: "The pin is outside our Curaçao safety box. We still keep the original values.",
  },
  {
    key: "sourceNeighbourhood",
    label: "Area from the website",
    hint: "Neighbourhood name came from the listing site. We never silently overwrite it.",
  },
  {
    key: "geographicallyInferred",
    label: "Area from the map",
    hint: "No area on the ad — we guessed it by dropping the pin onto official neighbourhood boundaries.",
  },
  {
    key: "matchedSourceAndGeography",
    label: "Website & map agree",
    hint: "The website’s neighbourhood matches the area under the map pin.",
  },
  {
    key: "sourceGeographyConflict",
    label: "Website & map disagree",
    hint: "The website named one area, but the pin sits in another. We keep both so you can decide.",
  },
  {
    key: "outsideKnownPolygons",
    label: "No matching area",
    hint: "Valid Curaçao coordinates that do not fall inside a known neighbourhood shape.",
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
          Quick counts for {formatNumber(summary.totalListings)} listings.
          Hover any card for a plain-language explanation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUALITY_ITEMS.map((item) => (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild>
                <div className="cursor-help rounded-lg border bg-muted/20 p-3 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {item.label}
                    </p>
                    <Badge variant="outline">?</Badge>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {formatNumber(summary[item.key])}
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-left leading-relaxed">
                {item.hint}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
