import type { Metadata } from "next";

import { GetNowSimulator } from "./get-now-simulator";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get Now" };

export default function SimulatorPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Get Now"
        description="See what a landlord would receive today for rent paid forward. Use an eligible six-month quote to prefill Create Offer. Quotes above 24% cannot be saved."
      />
      <GetNowSimulator />
    </div>
  );
}
