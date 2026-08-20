export function formatCurrency(
  value: number | null,
  currency: string | null,
  compact = false,
) {
  if (value === null || !currency) return "Not available";
  const code = currency.trim().toUpperCase();
  // XCG/ANG/NAf: avoid Intl currency style — Node vs browser symbols diverge
  // (`Cg.` vs `XCG`) and break hydration. ANG/NAf are 1:1 with XCG.
  if (code === "XCG" || code === "ANG" || code === "NAF") {
    const amount = compact
      ? new Intl.NumberFormat("en", {
          notation: "compact",
          maximumFractionDigits: 0,
        }).format(Math.round(value))
      : new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(
          Math.round(value),
        );
    return `XCG ${amount}`;
  }
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${Intl.NumberFormat("en").format(Math.round(value))}`;
  }
}

/** Stable original-amount label for tooltips (avoids Intl XCG symbol drift). */
export function formatOriginalPriceLabel(amount: number, currency: string) {
  return formatCurrency(amount, currency);
}

export function formatNumber(value: number) {
  return Intl.NumberFormat("en").format(value);
}

/** Fixed zone so SSR and the browser render the same clock for hydration. */
const DISPLAY_TIME_ZONE = "America/Curacao";

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CW", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
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
    timeZone: DISPLAY_TIME_ZONE,
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

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function titleCase(value: string | null) {
  if (!value) return "Not specified";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
