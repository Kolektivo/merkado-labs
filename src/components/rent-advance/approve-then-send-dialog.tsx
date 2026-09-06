"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  settledApproveThenSendState,
  type ApproveThenSendOutcome,
  type ApproveThenSendStep,
} from "@/lib/pay/approve-then-send-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type { ApproveThenSendOutcome } from "@/lib/pay/approve-then-send-state";

/**
 * Single-action wallet flow: when the action needs an ERC-20 approval, the
 * dialog first sends the approval, then the main transaction, then waits for
 * server verification. A submitted transaction stays in this flow until its
 * receipt is verified, so a broadcast can never be sent twice.
 */
export function ApproveThenSendDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  sendLabel,
  needsApproval,
  summary,
  runApprove,
  runSend,
  runVerifyPending,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  sendLabel: string;
  needsApproval: boolean;
  summary: ReactNode;
  runApprove: () => Promise<void>;
  runSend: () => Promise<ApproveThenSendOutcome>;
  runVerifyPending: () => Promise<ApproveThenSendOutcome>;
  onConfirmed: () => void;
}) {
  const [step, setStep] = useState<ApproveThenSendStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const inFlight = step === "approve" || step === "send" || step === "verify";

  function resetForRetry() {
    setError(null);
    setStep("idle");
  }

  function finish(outcome: ApproveThenSendOutcome) {
    const next = settledApproveThenSendState(outcome);
    setStep(next.step);
    setError(next.error);
    if (outcome.status === "confirmed") {
      onConfirmed();
      // The payment/purchase went through; close the modal and show the
      // success on the underlying page.
      onOpenChange(false);
    }
  }

  async function start() {
    setError(null);
    try {
      if (needsApproval) {
        setStep("approve");
        await runApprove();
      }
      setStep("send");
      let outcome = await runSend();
      while (outcome.status === "pending") {
        setStep("verify");
        await new Promise((resolve) => window.setTimeout(resolve, 4000));
        outcome = await runVerifyPending();
      }
      finish(outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action did not go through.");
      setStep("idle");
    }
  }

  const busyLabel =
    step === "approve"
      ? "Approving USDC…"
      : step === "send"
        ? `${sendLabel}…`
        : "Confirming…";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!inFlight) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {summary}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not complete</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          {inFlight ? (
            <Button className="min-h-11 w-full" disabled>
              <Loader2 className="animate-spin" aria-hidden />
              {busyLabel}
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11 w-full"
              onClick={() => void start()}
            >
              {confirmLabel}
            </Button>
          )}

          {!inFlight && step === "idle" && error ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              onClick={resetForRetry}
            >
              Try again
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
