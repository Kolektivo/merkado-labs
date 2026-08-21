"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ActionSuccessDialog } from "@/components/action-success-dialog";

export function RouteSuccessDialog({
  title,
  description,
  amount,
  storageKey,
  closeHref,
  primaryLabel,
  primaryHref,
}: {
  title: string;
  description: string;
  amount?: ReactNode;
  storageKey?: string;
  closeHref: string;
  primaryLabel?: string;
  primaryHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [storedAmount, setStoredAmount] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    const value = window.sessionStorage.getItem(storageKey);
    if (!value) return;
    const timeout = window.setTimeout(() => {
      setStoredAmount(value);
      window.sessionStorage.removeItem(storageKey);
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [storageKey]);

  return (
    <ActionSuccessDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) router.replace(closeHref, { scroll: false });
      }}
      title={title}
      description={description}
      amount={amount ?? storedAmount}
      primaryLabel={primaryLabel}
      primaryHref={primaryHref}
    />
  );
}
