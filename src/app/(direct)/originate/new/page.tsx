import type { Metadata } from "next";

import { NewOfferWizard } from "./new-offer-wizard";
import { PageHeader } from "@/components/page-header";
import { seedOfferTemplate } from "@/lib/rent-advance/actions";
import { applyQuoteCarry, parseQuoteCarry } from "@/lib/rent-advance/quote-carry";
import { WalletIdentity } from "@/components/wallet-identity";

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
            ? `${initial.reference} has pricing prefilled from the Simulator. Check the property and renter before you submit the six-month request. Sign in with your wallet to save or submit.`
            : `Start a new offer — ${initial.reference} is the next reference. Add a photo, check the figures, then request review. Sign in with your wallet to save or submit.`
        }
      />
      <WalletIdentity />
      <NewOfferWizard initial={initial} startStep={carry ? 5 : 1} />
    </div>
  );
}
