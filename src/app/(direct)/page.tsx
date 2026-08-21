import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { HomeAttentionCards } from "@/components/dashboard-notifications";
import { MarketplaceOfferCard } from "@/components/marketplace/marketplace-offer-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardNotifications } from "@/lib/rent-advance/notifications";
import { formatXcg } from "@/lib/rent-advance/money";
import { bookTotals } from "@/lib/rent-advance/helpers";
import { listMarketplaceCards, loadBook } from "@/lib/rent-advance/store";

export const dynamic = "force-dynamic";

export default async function DirectPage() {
  const [book, marketplace] = await Promise.all([
    loadBook(),
    listMarketplaceCards(),
  ]);
  const totals = bookTotals(book);
  const notifications = dashboardNotifications(book);
  const openFunding = book.offers.filter((offer) => offer.status === "funding").length;
  const featured = [...marketplace]
    .sort((a, b) => {
      const openA = a.status === "funding" && a.fundedCents < a.offeringCents ? 0 : 1;
      const openB = b.status === "funding" && b.fundedCents < b.offeringCents ? 0 : 1;
      if (openA !== openB) return openA - openB;
      return a.offeringCents - b.offeringCents;
    })
    .slice(0, 2);

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Rent paid forward
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Landlords receive the next months of rent today. Renters keep paying
            the same amount through Merkado Pay. Figures are shown in Caribbean
            guilders (XCG).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/originate/new">
              Create offer
              <ArrowRight />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/originate/simulator">Open Simulator</Link>
          </Button>
        </div>
      </div>

      <HomeAttentionCards items={notifications} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Paid to landlords"
          value={formatXcg(totals.totalAdvanced, true)}
        />
        <StatCard label="Open on Marketplace" value={String(openFunding)} />
        <StatCard label="Active offers" value={String(totals.live)} />
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Marketplace</h2>
            <p className="text-sm text-muted-foreground">
              Open offers available to purchase.
            </p>
          </div>
          <Button variant="ghost" asChild>
            <Link href="/offers">
              Browse all
              <ArrowRight />
            </Link>
          </Button>
        </div>
        {featured.length ? (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {featured.map((card, index) => (
              <li key={card.reference} className="flex">
                <MarketplaceOfferCard card={card} priority={index === 0} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No offers are open right now.
          </p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Portfolio</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Purchased positions and rent that arrives when the renter pays.
            </p>
            <Button asChild variant="outline" className="w-fit">
              <Link href="/portfolio">Open Portfolio</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Merkado Pay</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Renters pay the same monthly rent. Amounts show in XCG.
            </p>
            <Button asChild variant="outline" className="w-fit">
              <Link href="/pay">Open Pay</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  );
}
