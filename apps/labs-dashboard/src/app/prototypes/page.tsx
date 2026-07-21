import type { Metadata } from "next";
import Link from "next/link";
import { Eye, FlaskConical } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PrototypeNotice } from "@/components/prototype-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    href: "/search-requests",
    title: "Property Search Request",
    description:
      "Internal draft buyer requests for matching tests. No customer accounts or delivery.",
    data: "Real internal test data",
    status: "Draft",
  },
  {
    href: "/what-fits-me",
    title: "What Fits Me?",
    description:
      "A structured draft questionnaire only. Not mortgage or affordability advice.",
    data: "Creates internal test data",
    status: "Draft",
  },
  {
    href: "/agent",
    title: "Merkado Agent",
    description:
      "Test access for request-based matching. No billing, subscriptions, or email.",
    data: "Real internal test data",
    status: "Draft",
  },
] as const;

export default function PrototypesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Prototypes"
        description="Early research concepts kept separate from operations and Public preview."
        icon={FlaskConical}
        actions={
          <Button variant="outline" asChild>
            <Link href="/browse">
              <Eye data-icon="inline-start" />
              Open Public preview
            </Link>
          </Button>
        }
      />
      <PrototypeNotice>
        No subscriptions, billing, customer email, or financial advice are
        connected.
      </PrototypeNotice>
      <div className="grid gap-4 sm:grid-cols-2">
        {prototypes.map((prototype) => (
          <Link key={prototype.href} href={prototype.href}>
            <Card className="h-full transition-colors hover:bg-muted/30">
              <CardHeader>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{prototype.status}</Badge>
                  <Badge variant="outline">{prototype.data}</Badge>
                </div>
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
