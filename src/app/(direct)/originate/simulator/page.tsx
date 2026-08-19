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
        description="See how much cash a landlord would get now if they sell the next few months of rent. The renter still pays the same rent. Only a six-month quote can start an offer."
      />
      <GetNowSimulator />
    </div>
  );
}
