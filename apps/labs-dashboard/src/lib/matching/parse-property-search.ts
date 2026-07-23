/**
 * Deterministic natural-language → Property Search criteria parser.
 * English and common Dutch property phrases. No AI runtime dependency.
 */

import {
  SAFE_NEIGHBOURHOOD_ALIASES,
  canonicalizeNeighbourhood,
  normalizeNeighbourhoodKey,
} from "../domain/neighbourhood-aliases.ts";

import {
  emptyCriteria,
  type PropertySearchCriteria,
  type RenovationWillingness,
  type TransactionType,
} from "./types.ts";

const AMENITY_PATTERNS: Array<{
  key: string;
  label: string;
  patterns: RegExp[];
}> = [
  {
    key: "pool",
    label: "pool",
    patterns: [/\b(swimming\s*)?pool\b/i, /\bzwembad\b/i],
  },
  {
    key: "parking",
    label: "parking",
    patterns: [
      /\bparking\b/i,
      /\bgarage\b/i,
      /\bparkeerplaats(en)?\b/i,
      /\bparkeren\b/i,
    ],
  },
  {
    key: "garden",
    label: "garden",
    patterns: [/\bgarden\b/i, /\btuin\b/i, /\byard\b/i],
  },
  {
    key: "waterfront",
    label: "waterfront",
    patterns: [
      /\bwaterfront\b/i,
      /\bwater\s*front\b/i,
      /\boceanfront\b/i,
      /\bbeachfront\b/i,
      /\baan\s+het\s+water\b/i,
    ],
  },
  {
    key: "gated_community",
    label: "gated community",
    patterns: [
      /\bgated(\s+community)?\b/i,
      /\bafgesloten\s+wijk\b/i,
      /\bbeveiligde\s+(wijk|community)\b/i,
    ],
  },
  {
    key: "sea_view",
    label: "sea view",
    patterns: [/\bsea\s*view\b/i, /\bocean\s*view\b/i, /\bzeezicht\b/i],
  },
  {
    key: "terrace",
    label: "terrace",
    patterns: [/\bterrace\b/i, /\bterras\b/i, /\bbalcony\b/i, /\bbalkon\b/i],
  },
  {
    key: "air_conditioning",
    label: "air conditioning",
    patterns: [/\bair\s*conditioning\b/i, /\b\bac\b/i, /\bairco\b/i],
  },
  {
    key: "furnished",
    label: "furnished",
    patterns: [/\bfurnished\b/i, /\bgemeubileerd\b/i],
  },
  {
    key: "accessibility",
    label: "accessibility",
    patterns: [
      /\baccessib(le|ility)\b/i,
      /\bwheelchair\b/i,
      /\brolstoel(toegankelijk)?\b/i,
    ],
  },
  {
    key: "outdoor_space",
    label: "outdoor space",
    patterns: [
      /\boutdoor\s+space\b/i,
      /\bbuitenruimte\b/i,
      /\boutdoor\s+living\b/i,
    ],
  },
];

const PROPERTY_TYPE_PATTERNS: Array<{ type: string; patterns: RegExp[] }> = [
  {
    type: "house",
    patterns: [
      /\b(houses?|homes?)\b/i,
      /\b(huis|huizen|woning|woningen)\b/i,
      /\bfamily\s+home\b/i,
      /\beengezinswoning\b/i,
    ],
  },
  {
    type: "villa",
    patterns: [/\bvillas?\b/i, /\bvilla'?s?\b/i],
  },
  {
    type: "apartment",
    patterns: [
      /\bapartments?\b/i,
      /\bflats?\b/i,
      /\bappartement(en)?\b/i,
      /\bcondo(minium)?s?\b/i,
    ],
  },
  {
    type: "townhouse",
    patterns: [/\btown\s*houses?\b/i, /\brijtjeshuis(en)?\b/i],
  },
  {
    type: "land",
    patterns: [/\b(land|lot|kavel|perceel)\b/i, /\bbouwgrond\b/i],
  },
];

const KNOWN_NEIGHBOURHOODS: string[] = Array.from(
  new Set([
    ...Object.values(SAFE_NEIGHBOURHOOD_ALIASES),
    "Jan Thiel",
    "Brakkeput",
    "Brakkeput Abou",
    "Brakkeput Mei Mei",
    "Piscadera",
    "Saliña",
    "Willemstad",
    "Otrobanda",
    "Punda",
    "Pietermaai",
    "Scharloo",
    "Mahaai",
    "Jan Sofat",
    "Blue Bay",
    "Spanish Water",
    "Caracasbaai",
    "Cas Abou",
    "Cas Grandi",
    "Santa Catharina",
    "Sint Michiel",
    "Banda Abou",
    "Westpunt",
    "Soto",
    "Barber",
    "Groot Santa Martha",
    "Zuikertuintje",
    "Mundo Nobo",
    "Seru Loraweg",
    "Bottelier",
    "Sun Valley",
    "Toni Kunchi",
    "Mambo Beach",
    "Marie Pampoen",
    "Sint Joris",
    "Vista Royal",
    "Boca Gentil",
    "Coral Estate",
    "Hoogstraat",
    "Steenrijk",
    "Dokterstuin",
  ]),
).sort((a, b) => b.length - a.length);

function uniquePreserve(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

function parseBudgetAmount(raw: string): number | null {
  let cleaned = raw.replace(/\s+/g, "");
  if (!cleaned) return null;
  // European thousands (3.500 / 850.000) vs US thousands (850,000).
  if (/^\d{1,3}(\.\d{3})+(k|m)?$/i.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k|m)?$/i);
  if (!match) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  let amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "k") amount *= 1_000;
  if (suffix === "m") amount *= 1_000_000;
  return Math.round(amount);
}

function extractBudgets(text: string): {
  minPrice: number | null;
  maxPrice: number | null;
} {
  let minPrice: number | null = null;
  let maxPrice: number | null = null;

  const underPatterns = [
    /\b(?:under|below|max(?:imum)?|up\s+to|tot|onder|maximaal|höchstens)\s*(?:cg|xcg|naf|ang|\$|usd|eur)?\s*([\d.,]+\s*[km]?)\b/gi,
    /\b(?:cg|xcg|naf|ang)\s*([\d.,]+\s*[km]?)\s*(?:or\s+less|max|maximum)?\b/gi,
  ];
  for (const pattern of underPatterns) {
    for (const match of text.matchAll(pattern)) {
      const amount = parseBudgetAmount(match[1] ?? "");
      if (amount !== null) {
        maxPrice = maxPrice === null ? amount : Math.min(maxPrice, amount);
      }
    }
  }

  const overPatterns = [
    /\b(?:over|above|at\s+least|from|vanaf|minimaal|minimum)\s*(?:cg|xcg|naf|ang|\$|usd|eur)?\s*([\d.,]+\s*[km]?)\b/gi,
  ];
  for (const pattern of overPatterns) {
    for (const match of text.matchAll(pattern)) {
      const amount = parseBudgetAmount(match[1] ?? "");
      if (amount !== null) {
        minPrice = minPrice === null ? amount : Math.max(minPrice, amount);
      }
    }
  }

  const range = text.match(
    /\b(?:cg|xcg|naf|ang|\$)?\s*([\d.,]+\s*[km]?)\s*(?:-|–|to|tot)\s*(?:cg|xcg|naf|ang|\$)?\s*([\d.,]+\s*[km]?)\b/i,
  );
  if (range) {
    const a = parseBudgetAmount(range[1] ?? "");
    const b = parseBudgetAmount(range[2] ?? "");
    if (a !== null && b !== null) {
      minPrice = Math.min(a, b);
      maxPrice = Math.max(a, b);
    }
  }

  // Bare currency + number near budget words (e.g. "budget Cg 850,000")
  if (maxPrice === null) {
    const budgetNear = text.match(
      /\b(?:budget|prijs|price)\b[^.]{0,40}\b(?:cg|xcg|naf|ang)?\s*([\d.,]+\s*[km]?)\b/i,
    );
    if (budgetNear) {
      maxPrice = parseBudgetAmount(budgetNear[1] ?? "");
    }
  }

  return { minPrice, maxPrice };
}

function extractTransactionType(text: string): TransactionType {
  const lower = text.toLowerCase();
  const rent =
    /\b(rent|rental|te\s+huur|huren|for\s+rent)\b/.test(lower) &&
    !/\b(buy\s+or\s+rent|sale\s+or\s+rent)\b/.test(lower);
  const sale =
    /\b(buy|purchase|te\s+koop|for\s+sale|buying|koop)\b/.test(lower) ||
    /\bhouse\b/.test(lower) ||
    /\bvilla\b/.test(lower);
  // Default sale for typical ownership phrasing without rent cues.
  if (rent && !/\b(buy|purchase|te\s+koop|for\s+sale)\b/.test(lower)) {
    return "rent";
  }
  if (sale && !rent) return "sale";
  if (rent && sale) return "either";
  // "looking for a house … under Cg" → treat as sale by default
  if (/\b(looking\s+for|zoek|zoeken|wil)\b/.test(lower) && !rent) {
    return "sale";
  }
  return "either";
}

function extractBedrooms(text: string): number | null {
  const patterns = [
    /\b(\d+)\s*[- ]?\s*(?:bed(?:room)?s?|br)\b/i,
    /\b(\d+)\s*[- ]?\s*(?:slaapkamer(?:s|en)?)\b/i,
    /\b(?:bed(?:room)?s?|slaapkamer(?:s|en)?)\s*[:=]?\s*(\d+)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const n = Number(match[1] ?? match[2]);
      if (Number.isFinite(n) && n >= 0 && n <= 20) return n;
    }
  }
  return null;
}

function extractBathrooms(text: string): number | null {
  const patterns = [
    /\b(\d+(?:\.\d+)?)\s*[- ]?\s*(?:bath(?:room)?s?|ba)\b/i,
    /\b(\d+(?:\.\d+)?)\s*[- ]?\s*(?:badkamer(?:s|en)?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 20) return n;
    }
  }
  return null;
}

function extractFloorArea(text: string): number | null {
  const match = text.match(
    /\b(?:at\s+least|min(?:imum)?|vanaf|minimaal)?\s*(\d{2,5})\s*(?:m2|m²|sqm|square\s*meters?|vierkante\s*meter)\b/i,
  );
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function extractLocations(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();

  for (const name of KNOWN_NEIGHBOURHOODS) {
    const key = normalizeNeighbourhoodKey(name);
    if (!key) continue;
    // Word-boundary-ish match on folded text
    const folded = normalizeNeighbourhoodKey(text);
    if (folded.includes(key)) {
      const canonical = canonicalizeNeighbourhood(name).canonicalDisplay ?? name;
      found.push(canonical);
      continue;
    }
    // Also try original casing substring for multi-word names
    if (lower.includes(name.toLowerCase())) {
      found.push(canonicalizeNeighbourhood(name).canonicalDisplay ?? name);
    }
  }

  // "around X or Y" / "in X"
  const around = text.match(
    /\b(?:around|near|in|bij|rond|dichtbij)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{2,40}?)(?:\s+or\s+|\s+of\s+|\s*,\s*|\s+en\s+)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{2,40})/i,
  );
  if (around) {
    for (const part of [around[1], around[2]]) {
      const canonical = canonicalizeNeighbourhood(part?.trim());
      if (canonical.canonicalDisplay) found.push(canonical.canonicalDisplay);
    }
  }

  return uniquePreserve(found);
}

function extractPropertyTypes(text: string): string[] {
  const types: string[] = [];
  for (const entry of PROPERTY_TYPE_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      types.push(entry.type);
    }
  }
  return uniquePreserve(types);
}

function extractAmenityMentions(text: string): {
  preferences: string[];
  mustHaves: string[];
  dealbreakers: string[];
} {
  const preferences: string[] = [];
  const mustHaves: string[] = [];
  const dealbreakers: string[] = [];

  const mustClause = text.match(
    /\b(?:must[- ]have|must\s+have|needs?|required|verplicht)\s+([^.!]+)/i,
  );
  const mustClauseText = mustClause?.[1] ?? "";

  for (const amenity of AMENITY_PATTERNS) {
    const hit = amenity.patterns.some((pattern) => pattern.test(text));
    if (!hit) continue;

    const negated = amenity.patterns.some((pattern) =>
      new RegExp(
        `\\b(?:no|without|geen|zonder|not)\\b[\\s\\w-]{0,20}${pattern.source}`,
        "i",
      ).test(text),
    );
    if (negated) {
      dealbreakers.push(amenity.label);
      continue;
    }

    const inMustClause = amenity.patterns.some((pattern) =>
      pattern.test(mustClauseText),
    );
    if (inMustClause) {
      mustHaves.push(amenity.label);
    } else {
      preferences.push(amenity.label);
    }
  }

  return {
    preferences: uniquePreserve(
      preferences.filter((item) => !mustHaves.includes(item)),
    ),
    mustHaves: uniquePreserve(mustHaves),
    dealbreakers: uniquePreserve(dealbreakers),
  };
}

function extractRenovation(text: string): RenovationWillingness {
  const lower = text.toLowerCase();
  if (
    /\b(move[- ]in\s+ready|no\s+renovation|niet\s+verbouwen|geen\s+verbouwing)\b/.test(
      lower,
    )
  ) {
    return "none";
  }
  if (/\b(light\s+renovation|kleine\s+verbouwing|cosmetic)\b/.test(lower)) {
    return "light";
  }
  if (/\b(moderate\s+renovation|redelijke\s+verbouwing)\b/.test(lower)) {
    return "moderate";
  }
  if (
    /\b(major\s+renovation|fixer[- ]upper|project\s+home|grote\s+verbouwing|verbouwen)\b/.test(
      lower,
    )
  ) {
    return "major";
  }
  return "unknown";
}

function buildTitle(criteria: PropertySearchCriteria): string {
  const bits: string[] = [];
  if (criteria.transactionType === "rent") bits.push("Rental");
  else if (criteria.transactionType === "sale") bits.push("Home");
  else bits.push("Property");
  if (criteria.minBedrooms !== null) bits.push(`${criteria.minBedrooms}-bed`);
  if (criteria.propertyTypes[0]) bits.push(criteria.propertyTypes[0]);
  if (criteria.preferredNeighbourhoods.length) {
    bits.push(`in ${criteria.preferredNeighbourhoods.slice(0, 2).join(" / ")}`);
  }
  if (criteria.maxPrice !== null) {
    bits.push(`under Cg ${Math.round(criteria.maxPrice).toLocaleString("en")}`);
  }
  return bits.join(" ").replace(/\s+/g, " ").trim() || "Property Search";
}

/**
 * Parse free-text housing needs into editable Property Search criteria.
 */
export function parsePropertySearchText(input: string): PropertySearchCriteria {
  const text = input.trim();
  if (!text) {
    return emptyCriteria({
      unclear: ["Empty request — describe what you are looking for."],
    });
  }

  const { minPrice, maxPrice } = extractBudgets(text);
  const amenities = extractAmenityMentions(text);
  const renovationWillingness = extractRenovation(text);
  const preferences = [...amenities.preferences];
  if (renovationWillingness === "none" || renovationWillingness === "light") {
    preferences.push("move-in ready");
  } else if (
    renovationWillingness === "moderate" ||
    renovationWillingness === "major"
  ) {
    preferences.push("renovation candidate");
  }

  const unclear: string[] = [];
  if (/\b(?:wfh|work\s+from\s+home|thuiswerken)\b/i.test(text)) {
    unclear.push("Work-from-home needs (not matched as a hard filter yet)");
  }
  if (/\b(?:lot|perceel|kavel)\s*(?:size|oppervlakte)?\b/i.test(text)) {
    unclear.push("Lot size preference (floor area is supported; lot size is noted only)");
  }

  const criteria = emptyCriteria({
    transactionType: extractTransactionType(text),
    minPrice,
    maxPrice,
    minBedrooms: extractBedrooms(text),
    minBathrooms: extractBathrooms(text),
    minFloorAreaM2: extractFloorArea(text),
    propertyTypes: extractPropertyTypes(text),
    preferredNeighbourhoods: extractLocations(text),
    mustHaves: amenities.mustHaves,
    preferences: uniquePreserve(preferences),
    dealbreakers: amenities.dealbreakers,
    renovationWillingness,
    notes: text,
    unclear,
  });
  criteria.title = buildTitle(criteria);
  return criteria;
}

export const EXAMPLE_PROMPTS = [
  "I'm looking for a 3-bedroom house around Jan Thiel or Brakkeput, under Cg 850,000, with a pool and parking.",
  "Zoek een appartement te huur in Piscadera, maximaal Cg 3.500, met airco en parkeerplaats.",
  "2 bedroom villa near Blue Bay or Spanish Water, budget under 1.2M XCG, sea view preferred.",
] as const;
