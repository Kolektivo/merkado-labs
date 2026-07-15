import { AlertCircle, Settings2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function DataError({ message }: { message: string }) {
  return (
    <Empty className="border border-dashed py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Settings2 />
        </EmptyMedia>
        <EmptyTitle>Can&apos;t reach the merkado-labs database</EmptyTitle>
        <EmptyDescription>
          Check that the merkado-labs connection keys are set in{" "}
          <span className="font-mono text-xs">.env.local</span>, then refresh.
          We never invent placeholder listings.
        </EmptyDescription>
      </EmptyHeader>
      <Alert variant="destructive" className="max-w-lg text-left">
        <AlertCircle className="size-4" />
        <AlertTitle>What went wrong</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </Empty>
  );
}
