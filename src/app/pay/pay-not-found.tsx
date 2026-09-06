"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { usePayerLocale } from "./payer-locale";

export function PayNotFound() {
  const { copy } = usePayerLocale();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{copy.notFound}</h1>
      <p className="text-sm text-muted-foreground">{copy.openNextPayment}</p>
      <Button asChild>
        <Link href="/pay">{copy.payNow}</Link>
      </Button>
    </div>
  );
}
