import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { redirectIfDemoLocked } from "@/lib/demo-gate-server";

export default async function NotFound() {
  await redirectIfDemoLocked();
  return (
    <Empty className="min-h-[50vh] border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestion />
        </EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>
          This page is not part of the demo, or this offer is not on the
          marketplace.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/">Go to Overview</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/originate">Open offers</Link>
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}
