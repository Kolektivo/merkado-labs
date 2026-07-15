import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";

import { DataError } from "@/components/data-error";
import { GeographicQualityPanel } from "@/components/geographic-quality-panel";
import { PageHeader } from "@/components/page-header";
import { summarizeGeographicQuality } from "@/lib/data/analytics";
import { getAllListings } from "@/lib/data/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Data quality" };

export default async function DataQualityPage() {
  let listings;
  try {
    listings = await getAllListings();
  } catch (error) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Data quality"
          description="How complete and trustworthy locations and neighbourhoods are."
          icon={ShieldAlert}
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
        title="Data quality"
        description="Check whether pins and neighbourhood names look solid — and whether the website’s area name matches the map."
        icon={ShieldAlert}
      />
      <GeographicQualityPanel summary={summarizeGeographicQuality(listings)} />
    </div>
  );
}
