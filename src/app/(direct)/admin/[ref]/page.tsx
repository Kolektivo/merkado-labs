import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OfferAdminForms } from "@/app/(direct)/originate/[ref]/offer-ops-forms";
import { FeeBuildup } from "@/components/rent-advance/quote-result";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Money } from "@/components/money-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ARREARS_LADDER } from "@/lib/rent-advance/arrears";
import { canRecordCollection, statusLabel, statusTone } from "@/lib/rent-advance/helpers";
import { priceQuote } from "@/lib/rent-advance/pricing";
import { getOffer, loadBook } from "@/lib/rent-advance/store";
import { mergeOnchain } from "@/lib/rent-advance/custody";
import { isMerkadoConfigured } from "@/lib/onchain/config";
import { merkadoMinterAddressOrNull } from "@/lib/onchain/minter";
import { MintControl } from "./mint-control";
import { MintSweep } from "@/components/rent-advance/mint-sweep";

export const dynamic = "force-dynamic";

type Params = Promise<{ ref: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Admin · ${ref}` };
}

export default async function AdminOfferPage({ params }: { params: Params }) {
  const { ref } = await params;
  const [offer, book] = await Promise.all([getOffer(ref), loadBook()]);
  if (!offer) notFound();

  const onchain = mergeOnchain(offer.onchain);
  const configured = isMerkadoConfigured();
  const minterAddress = configured ? merkadoMinterAddressOrNull() : null;
  const nextReceivable =
    offer.receivables.find((row) => row.status === "scheduled") ?? null;
  const missed = offer.receivables.find((row) => row.status === "missed");

  let quote = null;
  try {
    quote = priceQuote({
      monthlyRentCents: offer.monthlyRentCents,
      months: offer.months,
      passportScore: offer.passport.total,
      payerScore: offer.tenant.scores.total,
      relatedParty: offer.relatedParty,
    });
  } catch {
    quote = null;
  }

  return (
    <div className="space-y-6">
      <MintSweep />
      <PageHeader
        title={offer.reference}
        description={`${offer.property.summary} · ${offer.property.district}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={statusTone(offer.status)}>
              {statusLabel(offer.status)}
            </StatusBadge>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin">All offers</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/originate/${offer.reference}`}>Customer view</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">Rent</CardTitle>
          </CardHeader>
          <CardContent>
            <Money cents={offer.monthlyRentCents} className="font-medium" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">
              Purchase
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Money cents={offer.purchasePriceCents} className="font-medium" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted-foreground">Filled</CardTitle>
          </CardHeader>
          <CardContent>
            <Money cents={offer.fundedCents} className="font-medium" />
            <span className="text-muted-foreground"> / </span>
            <Money cents={offer.offeringCents} />
          </CardContent>
        </Card>
      </div>

      <MintControl
        reference={offer.reference}
        configured={configured}
        tokenId={onchain.tokenId}
        contractAddress={onchain.contractAddress}
        mintTxHash={onchain.mintTxHash}
        purchased={onchain.purchased}
        minterAddress={minterAddress}
      />

      <OfferAdminForms
        reference={offer.reference}
        status={offer.status}
        nextReceivableN={nextReceivable?.n ?? null}
        actors={book.actors}
        onchainPurchased={onchain.purchased}
      />

      {canRecordCollection(offer.status) && !onchain.purchased ? (
        <p className="text-sm text-muted-foreground">
          Live renter payments land on this listing’s offer. The holder then
          claims them from Portfolio. Record collection is the fallback.
        </p>
      ) : null}

      {quote ? <FeeBuildup quote={quote} /> : null}

      {missed ? (
        <Card>
          <CardHeader>
            <CardTitle>Arrears</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {ARREARS_LADDER.map((step) => (
                <li key={step.day} className="px-3 py-1.5 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Day {step.day}.</span>{" "}
                  {step.action}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
