import type { Metadata } from "next";

import { NewOfferWizard } from "@/app/originate/new/new-offer-wizard";
import { PageHeader } from "@/components/page-header";
import { seedOfferTemplate } from "@/lib/rent-advance/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create offer" };

export default async function NewOfferPage() {
  const template = await seedOfferTemplate();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create offer"
        description={`${template.reference} is prefilled from the locked MRA-001 shape. Save as draft to add it to the book.`}
      />
      <NewOfferWizard initial={template} />
    </div>
  );
}
