import { Database } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { Badge } from "@/components/ui/badge";

export function SampleNotice({ listingCount }: { listingCount?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs">
      <Database className="size-4 text-muted-foreground" />
      <span className="font-medium">
        {listingCount
          ? `${Intl.NumberFormat("en").format(listingCount)} properties in merkado-labs`
          : "merkado-labs data is connected"}
      </span>
      <Badge variant="outline">
        <span className="size-1.5 rounded-full bg-neutral-700" />
        Live
      </Badge>
      <Badge variant="secondary" className="gap-1">
        View only
        <HelpTip label="view only">
          This dashboard never edits or deletes listings. It only reads the
          cleaned public copy of the data.
        </HelpTip>
      </Badge>
      <span className="inline-flex items-center gap-1 text-muted-foreground sm:ml-1">
        Cleaned listing data
        <HelpTip label="cleaned listing data">
          We copy public ads into a standard shape (price, bedrooms, location,
          and so on) so every source can be compared side by side. The original
          scrape files stay private.
        </HelpTip>
      </span>
    </div>
  );
}
