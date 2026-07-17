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

export default function NotFound() {
  return (
    <Empty className="min-h-[50vh] border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestion />
        </EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>
          This page does not exist or is no longer available. It may have been
          moved during a dashboard cleanup.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/">Go to Overview</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/listings">Browse listings</Link>
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}
