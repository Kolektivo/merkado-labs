import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Prototypes" };

const prototypes = [
  {
    href: "/browse",
    title: "Public browse and Passport",
    description:
      "Simple preview of listings clean enough to show publicly, plus a limited activity summary.",
  },
  {
    href: "/search-requests",
    title: "Property Search Request",
    description:
      "Internal draft buyer requests for matching tests. No customer accounts or delivery.",
  },
  {
    href: "/what-fits-me",
    title: "What Fits Me?",
    description:
      "A structured draft questionnaire only. Not mortgage or affordability advice.",
  },
  {
    href: "/agent",
    title: "Merkado Agent",
    description:
      "Test access for request-based matching. No billing, subscriptions, or email.",
  },
] as const;

export default function PrototypesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Prototypes"
        description="Experimental Labs concepts kept separate from the operational dashboard."
        icon={FlaskConical}
      />
      <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-4 text-sm dark:bg-amber-950/10">
        Experimental Labs prototypes — not live on merkado.cw. These pages do
        not provide real subscriptions, billing, email, or financial advice.
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {prototypes.map((prototype) => (
          <Link key={prototype.href} href={prototype.href}>
            <Card className="h-full transition-colors hover:bg-muted/30">
              <CardHeader>
                <CardTitle>{prototype.title}</CardTitle>
                <CardDescription>{prototype.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm font-medium">
                Open prototype
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
