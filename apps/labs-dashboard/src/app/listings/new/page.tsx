import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { NativeListingWizard } from "@/components/native-listing/native-listing-wizard";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add property" };

export default function NewNativeListingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add property"
        description="Labs admin native listing prototype. Creates a manual-origin real-estate listing without a scraper source URL."
        icon={Plus}
      />
      <Alert>
        <AlertTitle>Admin prototype — not production seller accounts</AlertTitle>
        <AlertDescription>
          Requires a Labs admin session. Listings use origin{" "}
          <code>manual</code>, store facts as user-provided, and never enter
          source-absence lifecycle logic. Production authenticated user listing
          remains planned separately.
        </AlertDescription>
      </Alert>
      <NativeListingWizard mode="create" />
    </div>
  );
}
