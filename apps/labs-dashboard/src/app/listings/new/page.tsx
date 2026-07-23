import type { Metadata } from "next";
import { Info, Plus } from "lucide-react";

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
        description="Create a polished property listing, preview it, and publish when it is ready."
        icon={Plus}
      />
      <Alert>
        <Info aria-hidden />
        <AlertTitle>Labs property-listing prototype</AlertTitle>
        <AlertDescription>
          Drafts stay private until you publish. Published properties are labeled
          “User provided” in Public preview; this is separate from production
          seller accounts.
        </AlertDescription>
      </Alert>
      <NativeListingWizard mode="create" />
    </div>
  );
}
