import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { DataError } from "@/components/data-error";
import { EnrichmentControlPanel } from "@/components/enrichment-control-panel";
import { PageHeader } from "@/components/page-header";
import { hasLabsAdminSession } from "@/lib/admin/auth";
import { getRecentAiEnrichmentJobs } from "@/lib/data/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI enrichment" };

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function firstParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
}

export default async function EnrichmentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const listingId =
    firstParam(params, "listingId") ?? firstParam(params, "listing");

  let jobs;
  try {
    jobs = await getRecentAiEnrichmentJobs(12);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AI enrichment"
          description="Queue OpenAI enrichment jobs for Labs listings. Proposals never overwrite source facts."
          icon={Sparkles}
        />
        <DataError
          message={error instanceof Error ? error.message : "Unknown data error"}
        />
      </div>
    );
  }

  const hasAdminSession = await hasLabsAdminSession();

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI enrichment"
        description="Preview scope counts, then run admin-gated enrichment jobs. OpenAI executes only in the Python worker. Labs prototype — not live on merkado.cw."
        icon={Sparkles}
      />
      <EnrichmentControlPanel
        initialListingId={listingId}
        initialJobs={jobs}
        hasAdminSession={hasAdminSession}
      />
      <section className="rounded-lg border p-4 text-sm text-muted-foreground space-y-2">
        <h2 className="font-medium text-foreground">Manual review checklist (existing ~25 paid proposals)</h2>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Open listing detail → AI proposal card; confirm status is needs-review / unreviewed.</li>
          <li>Verify concise summary and features cite supporting evidence from source text.</li>
          <li>Reject any price, currency, sold/rented date, coordinates, address, or ownership claims not in source facts.</li>
          <li>Flag missing supporting_evidence on features marked present.</li>
          <li>Do not auto-approve; use review control only after Labs admin unlock.</li>
          <li>Idempotent skips remain zero-cost — do not re-run the paid batch.</li>
        </ol>
      </section>
    </div>
  );
}
