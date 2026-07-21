"use client";

import { useId, useState } from "react";

import type { PublicDisplayDescription } from "@/lib/domain/types";

type DescriptionLocale = "en" | "nl";

type AboutPropertyDescriptionProps = {
  english: PublicDisplayDescription | null;
  dutch: PublicDisplayDescription | null;
  sectionLabels?: {
    overview?: string;
    layout?: string;
    location?: string;
    highlights?: string;
    practical?: string;
  };
};

function hasRenderableBlocks(desc: PublicDisplayDescription | null): boolean {
  if (!desc) return false;
  return Boolean(
    desc.overview ||
      desc.layout ||
      desc.location ||
      desc.practical ||
      desc.highlights.length,
  );
}

type SectionLabels = {
  overview: string;
  layout: string;
  location: string;
  highlights: string;
  practical: string;
};

function DescriptionBlocks({
  description,
  labels,
}: {
  description: PublicDisplayDescription;
  labels: SectionLabels;
}) {
  return (
    <>
      {description.overview ? (
        <section>
          <h2 className="text-sm font-medium">{labels.overview}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {description.overview}
          </p>
        </section>
      ) : null}
      {description.layout ? (
        <section>
          <h2 className="text-sm font-medium">{labels.layout}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {description.layout}
          </p>
        </section>
      ) : null}
      {description.location ? (
        <section>
          <h2 className="text-sm font-medium">{labels.location}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {description.location}
          </p>
        </section>
      ) : null}
      {description.highlights.length ? (
        <section>
          <h2 className="text-sm font-medium">{labels.highlights}</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {description.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {description.practical ? (
        <section>
          <h2 className="text-sm font-medium">{labels.practical}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {description.practical}
          </p>
        </section>
      ) : null}
    </>
  );
}

/**
 * About-this-property bilingual description body.
 * English is default/canonical; Dutch is optional client-side toggle.
 * Only one language is rendered at a time (no SEO duplicate body).
 */
export function AboutPropertyDescription({
  english,
  dutch,
  sectionLabels,
}: AboutPropertyDescriptionProps) {
  const groupId = useId();
  const labels: SectionLabels = {
    overview: sectionLabels?.overview ?? "Overview",
    layout: sectionLabels?.layout ?? "Layout",
    location: sectionLabels?.location ?? "Location",
    highlights: sectionLabels?.highlights ?? "Highlights",
    practical: sectionLabels?.practical ?? "Practical details",
  };

  const englishOk = hasRenderableBlocks(english);
  const dutchOk = hasRenderableBlocks(dutch);
  const [locale, setLocale] = useState<DescriptionLocale>("en");

  if (!englishOk && !dutchOk) return null;

  const activeLocale: DescriptionLocale =
    locale === "nl" && dutchOk ? "nl" : "en";
  const active =
    activeLocale === "nl" && dutchOk ? dutch : englishOk ? english : dutch;

  if (!active) return null;

  const showSwitcher = englishOk && dutchOk;

  return (
    <div className="space-y-4">
      {showSwitcher ? (
        <div
          role="group"
          aria-label="Description language"
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            id={`${groupId}-en`}
            aria-pressed={activeLocale === "en"}
            onClick={() => setLocale("en")}
            className={
              activeLocale === "en"
                ? "inline-flex items-center gap-1.5 rounded-md border border-foreground/20 bg-foreground px-2.5 py-1.5 text-xs font-medium text-background"
                : "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            }
          >
            <span aria-hidden="true">🇬🇧</span>
            <span>English</span>
          </button>
          <button
            type="button"
            id={`${groupId}-nl`}
            aria-pressed={activeLocale === "nl"}
            onClick={() => setLocale("nl")}
            className={
              activeLocale === "nl"
                ? "inline-flex items-center gap-1.5 rounded-md border border-foreground/20 bg-foreground px-2.5 py-1.5 text-xs font-medium text-background"
                : "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            }
          >
            <span aria-hidden="true">🇳🇱</span>
            <span>Nederlands</span>
          </button>
        </div>
      ) : null}
      <DescriptionBlocks description={active} labels={labels} />
    </div>
  );
}
