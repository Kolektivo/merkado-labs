import type { Metadata } from "next";

import { NewOfferWizard } from "./new-offer-wizard";
import { PageHeader } from "@/components/page-header";
import { seedOfferTemplate } from "@/lib/rent-advance/actions";
import { applyQuoteCarry, parseQuoteCarry } from "@/lib/rent-advance/quote-carry";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create offer" };

export default async function NewOfferPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const carry = parseQuoteCarry(params);
  const template = await seedOfferTemplate();
  const initial = carry ? applyQuoteCarry(template, carry) : template;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create offer"
        description={
          carry
            ? `${initial.reference} is prefilled from your Simulator quote. Submit a six-month quote under the 24% cap.`
            : `${initial.reference} is ready to complete. Add a photo, check the figures, then submit for review.`
        }
      />
      <NewOfferWizard initial={initial} startStep={carry ? 5 : 1} />
    </div>
  );
}
