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
    href: "/what-fits-me",
    title: "What Fits Me",
    description:
      "Natural-language Property Search with live matches from public-eligible Labs listings.",
    data: "Real Labs listings",
    status: "Working in Labs",
  },
  {
    href: "/search-requests",
    title: "Property Search",
    description:
      "Create or reopen structured Property Search requests and view saved matches.",
    data: "Real internal test data",
    status: "Working in Labs",
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
        connected. Matching is deterministic and Labs-only.
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
                Open
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
