import { Database } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { Badge } from "@/components/ui/badge";

type SampleNoticeProps = {
  listingCount?: number;
  approvedSourceCount?: number;
  publicEligibleCount?: number;
  empty?: boolean;
};

export function SampleNotice({
  listingCount,
  approvedSourceCount,
  publicEligibleCount,
  empty = false,
}: SampleNoticeProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs">
      <Database className="size-4 text-muted-foreground" />
      <span className="font-medium">
        {empty
          ? "Direct-source inventory is empty — adapters are being rebuilt"
          : listingCount
            ? `${Intl.NumberFormat("en").format(listingCount)} approved-source listings`
            : "merkado-labs data is connected"}
      </span>
      <Badge variant="outline">
        <span className="size-1.5 rounded-full bg-neutral-700" />
        Labs only
      </Badge>
      <Badge variant="secondary" className="gap-1">
        View only
        <HelpTip label="view only">
          This dashboard never edits or deletes listings. It only reads the
          cleaned public copy of the data.
        </HelpTip>
      </Badge>
      {typeof approvedSourceCount === "number" ? (
        <Badge variant="outline">
          {Intl.NumberFormat("en").format(approvedSourceCount)} sources
        </Badge>
      ) : null}
      {typeof publicEligibleCount === "number" ? (
        <Badge variant="outline">
          {Intl.NumberFormat("en").format(publicEligibleCount)} public-eligible
        </Badge>
      ) : null}
      <span className="inline-flex items-center gap-1 text-muted-foreground sm:ml-1">
        Retired sources excluded
        <HelpTip label="retired sources excluded">
          Disabled or retired sources are hidden from default dashboard views.
        </HelpTip>
      </span>
    </div>
  );
}
