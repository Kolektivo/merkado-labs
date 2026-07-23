"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Store,
  Tag,
  Undo2,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  availableNativeListingActions,
  type NativeListingAction,
} from "@/lib/native-listings/lifecycle-ui";
import { lifecycleLabel, lifecycleTone } from "@/lib/ui-labels";

const ACTIONS: Record<
  NativeListingAction,
  {
  label: string;
    description: string;
    confirmation: string;
    variant?: "default" | "outline" | "secondary";
    icon: typeof Store;
  }
> = {
  publish: {
    label: "Publish property",
    description: "Make this draft visible in Public preview.",
    confirmation:
      "Publish this property now? It will appear in Browse and receive a public Property Passport.",
    variant: "default",
    icon: Store,
  },
  unpublish: {
    label: "Unpublish",
    description: "Hide this property without deleting its history.",
    confirmation:
      "Unpublish this property? It will disappear from Browse but remain editable.",
    variant: "outline",
    icon: Undo2,
  },
  mark_sold: {
    label: "Mark sold",
    description: "Record that this property has been sold.",
    confirmation:
      "Mark this property as sold? It will be removed from active public listings.",
    variant: "secondary",
    icon: Tag,
  },
  mark_rented: {
    label: "Mark rented",
    description: "Record that this rental is no longer available.",
    confirmation:
      "Mark this property as rented? It will be removed from active public listings.",
    variant: "secondary",
    icon: Tag,
  },
  republish: {
    label: "Republish",
    description: "Return this property to active public listings.",
    confirmation:
      "Republish this property? It will become visible in Browse again.",
    variant: "default",
    icon: RotateCcw,
  },
};

export function NativeListingActions({
  listingId,
  status,
  publicEligible,
}: {
  listingId: string;
  status: string;
  publicEligible: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<NativeListingAction | null>(null);
  const [pending, startTransition] = useTransition();
  const actions = availableNativeListingActions(status);
  const canEdit = !["sold", "removed"].includes(status);
  const confirm = confirmAction ? ACTIONS[confirmAction] : null;
  const ConfirmIcon = confirm?.icon ?? Store;

  function run(action: NativeListingAction) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/native-listings/${listingId}/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Action failed.");
        setConfirmAction(null);
        setMessage(
          action === "publish" || action === "republish"
            ? "Property is now public."
            : action === "unpublish"
              ? "Property is now private."
              : `Property updated: ${ACTIONS[action].label.toLowerCase()}.`,
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Property management</p>
            <StatusBadge tone={lifecycleTone(status)}>
              {lifecycleLabel(status)}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Owner-entered property · changes are recorded on its timeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "active" && publicEligible ? (
            <Button asChild variant="outline" size="sm" className="h-10 sm:h-7">
              <Link href={`/browse/${listingId}`}>
                <Eye data-icon="inline-start" />
                Open Passport
              </Link>
            </Button>
          ) : null}
          {canEdit ? (
            <Button asChild variant="outline" size="sm" className="h-10 sm:h-7">
              <Link href={`/listings/${listingId}/edit`}>
                <Pencil data-icon="inline-start" />
                Edit property
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const item = ACTIONS[action];
          const Icon = item.icon;
          return (
            <Button
              key={action}
              type="button"
              size="sm"
              className="h-10 sm:h-7"
              variant={item.variant ?? "outline"}
              disabled={pending}
              title={item.description}
              onClick={() => setConfirmAction(action)}
            >
              <Icon data-icon="inline-start" />
              {item.label}
            </Button>
          );
        })}
        {!actions.length ? (
          <p className="text-sm text-muted-foreground">
            No lifecycle actions are available for this status.
          </p>
        ) : null}
      </div>
      {confirmAction && confirm ? (
        <Alert>
          <AlertTitle>Confirm {confirm.label.toLowerCase()}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{confirm.confirmation}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-10 sm:h-7"
                variant={confirm.variant ?? "default"}
                disabled={pending}
                onClick={() => run(confirmAction)}
              >
                {pending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <ConfirmIcon data-icon="inline-start" />
                )}
                Confirm {confirm.label.toLowerCase()}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-10 sm:h-7"
                disabled={pending}
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert aria-live="polite">
          <AlertTitle>Property updated</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
