"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  isOfficialExplorerBaseUrl,
  normalizeExplorerBaseUrl,
} from "@/lib/pay/networks";
import { isExplorableTxHash, truncateHash } from "@/lib/rent-advance/ids";
import { cn } from "@/lib/utils";

export function CopyValue({
  value,
  label,
  truncate = false,
  className,
}: {
  value: string;
  label: string;
  truncate?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const visible = truncate ? truncateHash(value) : value;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <code className="truncate font-mono text-sm" title={value}>
        {visible}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-9 shrink-0"
        onClick={copy}
        aria-label={/^(copy|kopieer|kopia)\b/i.test(label) ? label : `Copy ${label}`}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </Button>
    </span>
  );
}

export function ExplorerLink({
  baseUrl,
  hash,
}: {
  baseUrl: string | null | undefined;
  hash: string | null | undefined;
}) {
  if (!baseUrl || !hash) return null;
  if (!isExplorableTxHash(hash)) return null;
  if (!isOfficialExplorerBaseUrl(baseUrl)) return null;
  const href = `${normalizeExplorerBaseUrl(baseUrl)}/tx/${hash}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-sm underline underline-offset-2"
    >
      View on explorer <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
