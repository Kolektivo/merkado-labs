import "server-only";

/**
 * Intended daily Labs cron: 04:00 UTC = 00:00 America/Curacao
 * = 06:00 Amsterdam (CEST) / 05:00 Amsterdam (CET).
 */
export const DAILY_CRON_UTC = "0 4 * * *";
/** Matches GHA: daily cron On after 2026-07-21 supervised + idempotent gates. */
export const AUTOMATIC_REFRESH_ENABLED = true;

export function nextScheduledRunUtc(now = new Date()): Date {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      4,
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
