import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { merkadoDirectHref, merkadoPayHref } from "@/lib/pay/config";

export const metadata = { title: "Apps" };

function AppCard({
  title,
  body,
  href,
  external,
}: {
  title: string;
  body: string;
  href: string;
  external: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="block"
    >
      <Card className="transition-transform duration-150 ease-out hover:-translate-y-0.5">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle>{title}</CardTitle>
          {external ? <ArrowUpRight className="size-5" aria-hidden="true" /> : null}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{body}</p>
          {external ? (
            <p className="sr-only">Opens in a new tab</p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AppsPage() {
  const pay = merkadoPayHref();
  const direct = merkadoDirectHref();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Apps</h1>
        <p className="text-sm text-muted-foreground">
          Merkado products linked to this demo account.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <AppCard
          title="Merkado Pay"
          body="Pay rent in USDC and review your payment history."
          href={pay.href}
          external={pay.external}
        />
        <AppCard
          title="Merkado Direct"
          body="Open the landlord walkthrough: My Offers, Get Now, Marketplace, and Portfolio."
          href={direct.href}
          external={direct.external}
        />
      </div>
    </div>
  );
}
