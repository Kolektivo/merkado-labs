/**
 * Safe neighbourhood display canonicalization for Merkado Labs.
 *
 * Preserves original source / map / AI evidence strings elsewhere. This module
 * only produces a canonical *display* name for filters, cards, URLs, and public
 * detail. It never merges property assets.
 *
 * Keep in sync with:
 * `src/merkado_labs/enrichment/neighbourhood_canonical.py`
 */

export type CanonicalReason =
  | "exact_alias"
  | "suffix_strip"
  | "passthrough"
  | "generic"
  | "uncertain";

export type CanonicalNeighbourhood = {
  original: string | null;
  normalizedKey: string;
  canonicalDisplay: string | null;
  reason: CanonicalReason;
  confidence: number;
  safe: boolean;
};

/** Island-only mentions — accent-stripped keys only. */
const GENERIC_KEYS = new Set([
  "curacao",
  "curacao island",
  "island",
  "netherlands antilles",
  "dutch caribbean",
]);

const ISLAND_SUFFIX_DISPLAY_RE = /(?:\s+(?:[Cc]ura(?:ç|c)ao|[Ii]sland))+$/;
const PUNCT_RE = /[&/\\|+,;:]+/g;
const DOT_RE = /\./g;
const QUOTE_RE = /["'`´]/g;
const WS_RE = /\s+/g;
const ISLAND_SUFFIX_KEY_RE = /(?:\s+(?:curacao|island))+$/;

const UNCERTAIN_KEY_PATTERNS: RegExp[] = [
  /\bvista\s+royal\b.*\bjan\s+thiel\b/,
  /\bjan\s+thiel\b.*\bvista\s+royal\b/,
  /\bcas\s+abou\s+resort\b/,
];

/**
 * Reviewed SAFE aliases: normalized_key → canonical display name.
 * DO NOT map Brakkeput Abou / Mei Mei / Ariba → Brakkeput.
 * DO NOT map Cas Abou Resort → Cas Abou.
 * DO NOT map Salinja Abou / Salinja Ariba / Saliña Ariba → Saliña.
 * Mirrors SAFE_NEIGHBOURHOOD_ALIASES in neighbourhood_canonical.py — keep in sync.
 */
export const SAFE_NEIGHBOURHOOD_ALIASES: Record<string, string> = {
  "bottelier curacao": "Bottelier",
  "brakkeput curacao": "Brakkeput",
  "cas grandi curacao": "Cas Grandi",
  "sun valley curacao": "Sun Valley",
  "toni kunchi curacao": "Toni Kunchi",
  "jan thiel curacao": "Jan Thiel",
  "piscadera curacao": "Piscadera",
  "otrobanda curacao": "Otrobanda",
  "jan sofat curacao": "Jan Sofat",
  "mahaai curacao": "Mahaai",
  "mambo beach curacao": "Mambo Beach",
  "willemstad curacao": "Willemstad",
  "zuikertuintje curacao": "Zuikertuintje",
  "mundo nobo curacao": "Mundo Nobo",
  "seru loraweg curacao": "Seru Loraweg",
  "blauwbaai curacao": "Blue Bay",
  "blue bay curacao": "Blue Bay",
  // Saliña spelling variants (accent / j / bare / island suffix)
  salina: "Saliña",
  salinja: "Saliña",
  "salina curacao": "Saliña",
  "salinja curacao": "Saliña",
  // Marie Pampoen spelling variants (incl. dual-label source form)
  "marie pompoen": "Marie Pampoen",
  "marie pompoen curacao": "Marie Pampoen",
  "marie pampoen": "Marie Pampoen",
  "marie pampoen curacao": "Marie Pampoen",
  "marie pampoen marie pompoen": "Marie Pampoen",
  "marie pampoen marie pompoen curacao": "Marie Pampoen",
  "st joris": "Sint Joris",
  "st joris curacao": "Sint Joris",
  "sint joris": "Sint Joris",
  "sint joris curacao": "Sint Joris",
  "blue bay resort": "Blue Bay",
  "blue bay resort curacao": "Blue Bay",
  "blue bay golf beach resort": "Blue Bay",
  "blue bay golf beach resort curacao": "Blue Bay",
  "blue bay golf and beach resort": "Blue Bay",
  "blue bay golf and beach resort curacao": "Blue Bay",
};

function cleanRaw(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function stripAccents(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "");
}

function foldKeyCore(value: string, stripIslandSuffix: boolean): string {
  let text = value.normalize("NFKC").toLocaleLowerCase();
  text = stripAccents(text);
  text = text.replace(PUNCT_RE, " ");
  text = text.replace(DOT_RE, " ");
  text = text.replace(QUOTE_RE, "");
  text = text.replace(WS_RE, " ").trim();
  if (stripIslandSuffix) {
    text = text.replace(ISLAND_SUFFIX_KEY_RE, "").trim();
  }
  return text;
}

/** Comparison key — accents stripped; use canonicalDisplay for UI labels. */
export function normalizeNeighbourhoodKey(
  value: string | null | undefined,
): string {
  const cleaned = cleanRaw(value);
  if (!cleaned) return "";
  return foldKeyCore(cleaned, true);
}

function preSuffixKey(value: string): string {
  return foldKeyCore(value, false);
}

function stripIslandSuffixDisplay(value: string): string | null {
  const stripped = value
    .trim()
    .replace(ISLAND_SUFFIX_DISPLAY_RE, "")
    .replace(WS_RE, " ")
    .replace(/^[ ,\-/]+|[ ,\-/]+$/g, "")
    .trim();
  if (!stripped || stripped === value.trim()) return null;
  return stripped;
}

function isUncertainKey(key: string): boolean {
  if (!key) return false;
  return UNCERTAIN_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function canonicalizeNeighbourhood(
  value: string | null | undefined,
): CanonicalNeighbourhood {
  const original = cleanRaw(value);
  if (original === null) {
    return {
      original: null,
      normalizedKey: "",
      canonicalDisplay: null,
      reason: "generic",
      confidence: 1,
      safe: true,
    };
  }

  const rawKey = normalizeNeighbourhoodKey(original);
  const preKey = preSuffixKey(original);

  if (!rawKey || GENERIC_KEYS.has(rawKey) || GENERIC_KEYS.has(preKey)) {
    return {
      original,
      normalizedKey: rawKey || preKey,
      canonicalDisplay: null,
      reason: "generic",
      confidence: 1,
      safe: true,
    };
  }

  if (isUncertainKey(rawKey) || isUncertainKey(preKey)) {
    return {
      original,
      normalizedKey: rawKey,
      canonicalDisplay: original,
      reason: "uncertain",
      confidence: 0.35,
      safe: false,
    };
  }

  for (const key of [preKey, rawKey]) {
    const alias = SAFE_NEIGHBOURHOOD_ALIASES[key];
    if (alias) {
      return {
        original,
        normalizedKey: normalizeNeighbourhoodKey(alias),
        canonicalDisplay: alias,
        reason: "exact_alias",
        confidence: 1,
        safe: true,
      };
    }
  }

  const strippedDisplay = stripIslandSuffixDisplay(original);
  if (strippedDisplay) {
    const strippedKey = normalizeNeighbourhoodKey(strippedDisplay);
    if (!strippedKey || GENERIC_KEYS.has(strippedKey)) {
      return {
        original,
        normalizedKey: rawKey,
        canonicalDisplay: null,
        reason: "generic",
        confidence: 1,
        safe: true,
      };
    }
    const strippedAlias = SAFE_NEIGHBOURHOOD_ALIASES[strippedKey];
    if (strippedAlias) {
      return {
        original,
        normalizedKey: normalizeNeighbourhoodKey(strippedAlias),
        canonicalDisplay: strippedAlias,
        reason: "exact_alias",
        confidence: 1,
        safe: true,
      };
    }
    return {
      original,
      normalizedKey: rawKey,
      canonicalDisplay: strippedDisplay,
      reason: "suffix_strip",
      confidence: 0.92,
      safe: true,
    };
  }

  return {
    original,
    normalizedKey: rawKey,
    canonicalDisplay: original,
    reason: "passthrough",
    confidence: 1,
    safe: true,
  };
}

export function canonicalDisplayName(
  value: string | null | undefined,
): string | null {
  return canonicalizeNeighbourhood(value).canonicalDisplay;
}

/** Comparison key for filter matching after safe display canonicalization. */
export function canonicalComparisonKey(
  value: string | null | undefined,
): string {
  const result = canonicalizeNeighbourhood(value);
  if (result.canonicalDisplay) {
    return normalizeNeighbourhoodKey(result.canonicalDisplay);
  }
  return result.normalizedKey;
}

export function neighbourhoodKeysMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftKey = canonicalComparisonKey(left);
  const rightKey = canonicalComparisonKey(right);
  if (!leftKey || !rightKey) return false;
  return leftKey === rightKey;
}
