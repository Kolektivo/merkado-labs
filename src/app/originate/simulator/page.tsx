import type { Metadata } from "next";

import { GetNowSimulator } from "@/app/originate/simulator/get-now-simulator";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get Now" };

export default function SimulatorPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Get Now"
        description="See what a landlord would receive today for six months of rent. Quotes above 24% cannot complete."
      />
      <GetNowSimulator />
    </div>
  );
}
