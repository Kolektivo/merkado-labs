"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { ArrowRight, Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  markNotificationsRead,
  notificationReadServerSnapshot,
  notificationReadSnapshot,
  parseReadIds,
  subscribeNotificationReads,
} from "@/lib/rent-advance/notification-read-state";
import {
  navNotificationCounts,
  visibleNotifications,
  type DashboardNotification,
} from "@/lib/rent-advance/notifications";

export function useClearedNotificationIds() {
  const raw = useSyncExternalStore(
    subscribeNotificationReads,
    notificationReadSnapshot,
    notificationReadServerSnapshot,
  );
  return useMemo(() => parseReadIds(raw), [raw]);
}

export function useNavNotificationCounts(items: DashboardNotification[]) {
  const clearedIds = useClearedNotificationIds();
  return navNotificationCounts(items, clearedIds);
}

function NotificationRows({
  items,
  onOpen,
}: {
  items: DashboardNotification[];
  onOpen?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            onClick={onOpen}
            className="flex items-start justify-between gap-3 rounded-xl bg-primary/5 px-3 py-3 ring-1 ring-primary/15 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold">{item.subject}</span>
              <span className="text-xs text-muted-foreground">{item.title}</span>
              <span className="text-sm font-medium text-primary">{item.detail}</span>
            </span>
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-primary">
              Open and claim
              <ArrowRight />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function HomeAttentionCards({
  items,
}: {
  items: DashboardNotification[];
}) {
  const clearedIds = useClearedNotificationIds();
  const visible = visibleNotifications(items, clearedIds);

  if (visible.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Needs your attention
        </h2>
        <p className="text-sm text-muted-foreground">
          These amounts are ready. Open the offer or Portfolio to claim.
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {visible.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex h-full flex-col gap-3 rounded-xl border bg-primary/5 p-5 ring-1 ring-primary/20 transition-colors hover:bg-primary/10">
                <p className="text-base font-semibold">{item.subject}</p>
                <p className="text-sm text-muted-foreground">{item.title}</p>
                <p className="text-lg font-semibold text-primary">{item.detail}</p>
                <p className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Open and claim
                  <ArrowRight />
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DashboardNotifications({
  items,
}: {
  items: DashboardNotification[];
}) {
  const clearedIds = useClearedNotificationIds();
  const visible = visibleNotifications(items, clearedIds);
  const count = visible.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          className="relative size-10 shrink-0"
          aria-label={
            count
              ? `Notifications, ${count} ready to claim`
              : "Notifications"
          }
        >
          <Bell className="size-5" />
          <span
            className={
              count > 0
                ? "absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground ring-2 ring-background"
                : "hidden"
            }
            aria-hidden={count === 0}
          >
            {count}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] gap-3"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const root = event.target;
          if (!(root instanceof HTMLElement)) return;
          root.querySelector("a")?.focus();
        }}
      >
        <PopoverHeader className="px-1">
          <PopoverTitle>Notifications</PopoverTitle>
          <PopoverDescription>
            {count
              ? `${count} ready to claim`
              : items.length > 0
                ? "Reminders cleared"
                : "Nothing ready to claim"}
          </PopoverDescription>
        </PopoverHeader>
        {count > 0 ? (
          <NotificationRows items={visible} />
        ) : (
          <p className="px-1 text-sm text-muted-foreground">
            {items.length > 0
              ? "Reminders are hidden. Amounts that are still ready stay on My Offers or Portfolio."
              : "When a sale amount or rent is ready, it will show up here and on My Offers or Portfolio."}
          </p>
        )}
        {count > 0 ? (
          <>
            <Separator />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                markNotificationsRead(visible.map((item) => item.id))
              }
            >
              Clear all
            </Button>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

