import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(
  join(root, "src/components/about-property-description.tsx"),
  "utf8",
);

describe("AboutPropertyDescription bilingual contract", () => {
  it("defaults to English and exposes accessible language controls", () => {
    assert.match(source, /useState<DescriptionLocale>\("en"\)/);
    assert.match(source, /aria-pressed=\{activeLocale === "en"\}/);
    assert.match(source, /aria-pressed=\{activeLocale === "nl"\}/);
    assert.match(source, /🇬🇧/);
    assert.match(source, /🇳🇱/);
    assert.match(source, />English</);
    assert.match(source, />Nederlands</);
    assert.match(source, /aria-label="Description language"/);
  });

  it("falls back to English when Dutch is unavailable", () => {
    assert.match(source, /locale === "nl" && dutchOk \? "nl" : "en"/);
    assert.match(source, /englishOk \? english : dutch/);
  });
});
