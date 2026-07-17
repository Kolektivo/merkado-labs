"use client";

import { AlertCircle, Settings2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function DataError({ message }: { message: string }) {
  const category = /config|missing|placeholder|must target/i.test(message)
    ? "Configuration"
    : /auth|unauthorized|jwt|permission|session/i.test(message)
      ? "Authentication"
      : /network|fetch|timeout|connect|econn/i.test(message)
        ? "Network"
        : "Database query";
  const safeMessage = message
    .replace(/(sk-|sb_secret_)[A-Za-z0-9_-]+/g, "$1[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted token]");

  return (
    <Empty className="border border-dashed py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Settings2 />
        </EmptyMedia>
        <EmptyTitle>Can&apos;t reach the merkado-labs database</EmptyTitle>
        <EmptyDescription>
          {category} problem. The dashboard never replaces a failed query with
          fake listings or a misleading zero.
        </EmptyDescription>
      </EmptyHeader>
      <Alert variant="destructive" className="max-w-lg text-left">
        <AlertCircle className="size-4" />
        <AlertTitle>{category} failure</AlertTitle>
        <AlertDescription>{safeMessage}</AlertDescription>
      </Alert>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </Empty>
  );
}
