import "server-only";

/**
 * Intended daily Labs cron: 04:00 UTC = 00:00 America/Curacao
 * = 06:00 Amsterdam (CEST) / 05:00 Amsterdam (CET).
 */
export const DAILY_CRON_UTC = "0 4 * * *";
/**
 * HOLD (2026-07-27 Product Lead): Labs fully on hold — no automatic spend.
 * Live Ready inventory runs on merkado-cw. Documented cron kept for resume.
 */
export const AUTOMATIC_REFRESH_ENABLED = false;
/** Master switch for paid/manual Labs pipeline enqueue (mirrors Actions variable). */
export const LABS_OPERATIONS_ENABLED = false;

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
