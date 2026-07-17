import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { DataError } from "@/components/data-error";
import { EnrichmentControlPanel } from "@/components/enrichment-control-panel";
import { PageHeader } from "@/components/page-header";
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI enrichment"
        description="Preview scope counts, then run admin-gated enrichment jobs. OpenAI executes only in the Python worker."
        icon={Sparkles}
      />
      <EnrichmentControlPanel
        initialListingId={listingId}
        initialJobs={jobs}
      />
    </div>
  );
}
