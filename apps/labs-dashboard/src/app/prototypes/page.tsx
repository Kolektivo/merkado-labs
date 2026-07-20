import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
    data: "Real public-safe Labs data",
    status: "Testing",
  },
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
        description="Experimental Labs concepts kept separate from the operational dashboard."
        icon={FlaskConical}
      />
      <Alert>
        <FlaskConical />
        <AlertTitle>Experimental Labs prototypes</AlertTitle>
        <AlertDescription>
          Not live on merkado.cw. No subscriptions, billing, customer email, or
          financial advice are provided.
        </AlertDescription>
      </Alert>
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
