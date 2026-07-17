import type { Metadata } from "next";
import { Route } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getSourceRuns } from "@/lib/data/queries";
import { formatDateTime, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Source runs" };

export default async function SourceRunsPage() {
  const runs = await getSourceRuns();
  return <div className="space-y-6">
    <PageHeader title="Source runs" description="Recent direct-source imports and their counters." icon={Route} />
    <Card><CardContent className="divide-y px-0">
      {runs.length ? runs.map((run) => <div key={run.id} className="grid gap-2 px-6 py-4 text-sm md:grid-cols-[1fr_auto_auto]">
        <div><p className="font-medium">{run.sourceKey}</p><p className="text-xs text-muted-foreground">{run.adapterName}@{run.adapterVersion} · {formatDateTime(run.startedAt)}</p></div>
        <Badge variant="outline">{run.outcome}</Badge>
        <p className="font-mono text-xs text-muted-foreground">{formatNumber(run.importedCount)} imported · {formatNumber(run.updatedCount)} updated · {formatNumber(run.errorCount)} errors</p>
      </div>) : <p className="px-6 py-8 text-sm text-muted-foreground">No source runs recorded yet.</p>}
    </CardContent></Card>
  </div>;
}
