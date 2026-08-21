import { getSeedBook } from "@/lib/rent-advance/seed";
import type { Offer } from "@/lib/rent-advance/types";

function sanitizeByTemplate(input: unknown, template: unknown): unknown {
  if (Array.isArray(template)) {
    if (!Array.isArray(input)) return structuredClone(template);
    if (template.length === 0) {
      return input.filter(
        (value) =>
          value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean",
      );
    }
    return input.map((value) => sanitizeByTemplate(value, template[0]));
  }
  if (template && typeof template === "object") {
    const source =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      Object.entries(template).map(([key, shape]) => [
        key,
        sanitizeByTemplate(source[key], shape),
      ]),
    );
  }
  if (template === null) {
    return input === null ||
      typeof input === "string" ||
      typeof input === "number" ||
      typeof input === "boolean"
      ? input
      : null;
  }
  return typeof input === typeof template ? input : template;
}

/** Strip undeclared client fields before an Offer reaches the shared demo book. */
export function sanitizeOfferInput(input: unknown): Offer {
  return sanitizeByTemplate(input, getSeedBook().offers[0]) as Offer;
}
