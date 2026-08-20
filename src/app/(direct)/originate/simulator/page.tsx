import type { Metadata } from "next";

import { GetNowSimulator } from "./get-now-simulator";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Simulator" };

export default function SimulatorPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulator"
        description="See how much cash a landlord would receive for the next months of rent. Amounts are in XCG. Only a six-month quote can start an offer."
      />
      <GetNowSimulator />
    </div>
  );
}
