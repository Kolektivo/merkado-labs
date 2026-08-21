export const NOTIFICATION_READ_STORAGE_KEY = "merkado:direct-notifications:read";
export const NOTIFICATION_READ_EVENT = "merkado:direct-notifications";

let dismissedIds: string[] = [];

export function parseReadIds(raw: string | null): string[] {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function readStoredNotificationIds(): string[] {
  return dismissedIds;
}

export function writeStoredNotificationIds(ids: string[]) {
  dismissedIds = [...new Set(ids)];
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATION_READ_EVENT));
  }
}

export function markNotificationsRead(ids: string[]) {
  const next = [...new Set([...dismissedIds, ...ids])];
  writeStoredNotificationIds(next);
  return next;
}

export function clearStoredNotifications() {
  writeStoredNotificationIds([]);
}

export function subscribeNotificationReads(callback: () => void) {
  window.addEventListener(NOTIFICATION_READ_EVENT, callback);
  return () => {
    window.removeEventListener(NOTIFICATION_READ_EVENT, callback);
  };
}

export function notificationReadSnapshot() {
  return JSON.stringify(dismissedIds);
}

export function notificationReadServerSnapshot() {
  return "[]";
}
