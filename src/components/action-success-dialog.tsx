"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ActionSuccessDialog({
  open,
  onOpenChange,
  title,
  description,
  amount,
  primaryLabel = "Done",
  primaryHref,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  amount?: ReactNode;
  primaryLabel?: string;
  primaryHref?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 aria-hidden />
          </div>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {amount ? (
          <div className="rounded-xl bg-primary/5 p-4 text-center text-2xl font-semibold tracking-tight text-primary">
            {amount}
          </div>
        ) : null}
        <DialogFooter>
          {primaryHref ? (
            <>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Stay here
                </Button>
              </DialogClose>
              <Button asChild>
                <Link href={primaryHref}>{primaryLabel}</Link>
              </Button>
            </>
          ) : (
            <DialogClose asChild>
              <Button type="button">{primaryLabel}</Button>
            </DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
