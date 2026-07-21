/**
 * Deterministic Dutch ↔ English search synonym expansion.
 * No AI per query — expand tokens so Dutch searches match English public copy
 * (and English searches still match residual Dutch source text in admin search).
 */

/** Bidirectional synonym groups. First entry is the preferred English form. */
export const SEARCH_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["furnished", "gemeubileerd", "gemeubileerde", "ingericht"],
  ["unfurnished", "ongemeubileerd", "ongemeubileerde"],
  ["pool", "zwembad", "zwembaden"],
  ["detached", "vrijstaand", "vrijstaande"],
  ["apartment", "appartement", "appartementen", "flat"],
  ["house", "woning", "woonhuis", "huis", "eengezinswoning"],
  ["villa", "villas"],
  ["townhouse", "rijtjeshuis", "rijtjeswoning"],
  ["sale", "koop", "te koop", "for sale", "buy"],
  ["rent", "huur", "te huur", "for rent", "rental"],
  ["bedroom", "slaapkamer", "slaapkamers", "kamer"],
  ["bathroom", "badkamer", "badkamers"],
  ["garden", "tuin", "tuinen"],
  ["garage", "garagebox"],
  ["parking", "parkeerplaats", "parkeergelegenheid"],
  ["balcony", "balkon"],
  ["terrace", "terras"],
  ["sea view", "zeezicht", "uitzicht op zee"],
  ["waterfront", "aan het water", "waterlijn"],
  ["air conditioning", "airconditioning", "airco", "a/c"],
  ["gated community", "gated", "afgesloten wijk"],
  ["land", "grond", "bouwgrond", "perceel"],
  ["office", "kantoor", "kantoorpand"],
  ["commercial", "commercieel", "bedrijfspand"],
] as const;

const TERM_TO_GROUP = (() => {
  const map = new Map<string, readonly string[]>();
  for (const group of SEARCH_SYNONYM_GROUPS) {
    for (const term of group) {
      map.set(term.toLocaleLowerCase(), group);
    }
  }
  return map;
})();

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Expand a user query into unique lowercase terms including synonym peers.
 * Multi-word group members (e.g. "te koop", "sea view") are matched as phrases.
 */
export function expandSearchTerms(query: string): string[] {
  const normalized = normalizeWhitespace(query);
  if (!normalized) return [];

  const terms = new Set<string>([normalized]);

  // Whole-query phrase match against synonym entries.
  const wholeGroup = TERM_TO_GROUP.get(normalized);
  if (wholeGroup) {
    for (const term of wholeGroup) terms.add(term.toLocaleLowerCase());
  }

  // Token-level expansion (split on whitespace / punctuation).
  const tokens = normalized.split(/[\s,/|;]+/).filter(Boolean);
  for (const token of tokens) {
    terms.add(token);
    const group = TERM_TO_GROUP.get(token);
    if (group) {
      for (const term of group) terms.add(term.toLocaleLowerCase());
    }
  }

  // Two-token sliding window for phrases like "te koop", "sea view".
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const phrase = `${tokens[i]} ${tokens[i + 1]}`;
    terms.add(phrase);
    const group = TERM_TO_GROUP.get(phrase);
    if (group) {
      for (const term of group) terms.add(term.toLocaleLowerCase());
    }
  }

  return [...terms];
}

/** True when any searchable text contains the query or a synonym expansion. */
export function matchesSynonymSearch(
  texts: Array<string | null | undefined>,
  query: string,
): boolean {
  const normalized = normalizeWhitespace(query);
  if (!normalized) return true;

  const corpus = texts
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("\n")
    .toLocaleLowerCase();
  if (!corpus) return false;

  if (corpus.includes(normalized)) return true;

  return expandSearchTerms(normalized).some((term) => corpus.includes(term));
}
