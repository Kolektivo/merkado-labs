export function formatCurrency(
  value: number | null,
  currency: string | null,
  compact = false,
) {
  if (value === null || !currency) return "Not available";
  try {
    return new Intl.NumberFormat("en-CW", {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Intl.NumberFormat("en").format(value)}`;
  }
}

export function formatNumber(value: number) {
  return Intl.NumberFormat("en").format(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CW", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-CW", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatRelativeTime(value: string) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "Unknown";

  const deltaSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(deltaSeconds);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (abs < 60) return rtf.format(deltaSeconds, "second");
  if (abs < 3600) return rtf.format(Math.round(deltaSeconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(deltaSeconds / 3600), "hour");
  if (abs < 86400 * 30) {
    return rtf.format(Math.round(deltaSeconds / 86400), "day");
  }
  return rtf.format(Math.round(deltaSeconds / (86400 * 30)), "month");
}

export function titleCase(value: string | null) {
  if (!value) return "Not specified";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
