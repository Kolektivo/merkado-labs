import "server-only";

/** Intended daily Labs cron: 10:00 UTC = 06:00 America/Curacao. */
export const DAILY_CRON_UTC = "0 10 * * *";
/** Matches GHA: daily cron On after 2026-07-21 supervised + idempotent gates. */
export const AUTOMATIC_REFRESH_ENABLED = true;

export function nextScheduledRunUtc(now = new Date()): Date {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      10,
      0,
      0,
      0,
    ),
  );
  if (now.getTime() >= next.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}
