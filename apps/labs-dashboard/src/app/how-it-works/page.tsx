import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bug,
  ChevronDown,
  ChevronRight,
  Database,
  FolderTree,
  GitBranch,
  Globe2,
  Rocket,
  Server,
  Terminal,
  Wrench,
} from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "How it works" };

const FLOW_STEPS = [
  {
    step: "01",
    title: "Direct realtor website",
    detail: "Approved Curaçao sources (RE/MAX first) publish listing pages we may fetch in manual complete runs.",
    icon: Globe2,
    nextAction: "Parse",
  },
  {
    step: "02",
    title: "Source adapter",
    detail: "A source-specific adapter extracts price, currency, status, and evidence into a frozen snapshot.",
    icon: Terminal,
    nextAction: "Import",
  },
  {
    step: "03",
    title: "merkado-labs database",
    detail: "Listings, source-run health, currency provenance, and activity events live in Labs Supabase only.",
    icon: Database,
    nextAction: "Browse",
  },
  {
    step: "04",
    title: "This dashboard",
    detail: "Inspect coverage, eligibility, lifecycle, and geography. View only — nothing is edited here.",
    icon: Server,
    nextAction: null,
  },
] as const;

const FOLDERS = [
  {
    path: "src/merkado_labs/scrapers/",
    plain: "Source-neutral contracts and direct-source adapters",
  },
  {
    path: "supabase/migrations/",
    plain: "Database table definitions for merkado-labs",
  },
  {
    path: "apps/labs-dashboard/",
    plain: "This website you are looking at",
  },
  {
    path: "scripts/geo/",
    plain: "Neighbourhood assignment tooling",
  },
  {
    path: "scripts/cleanup/",
    plain: "Reviewed Labs data cleanup dry-run for retired sources (not destructive by default)",
  },
  {
    path: "docs/",
    plain: "Background notes and product context",
  },
] as const;

const GLOSSARY = [
  {
    term: "merkado-labs",
    tip: "Our safe sandbox project. Never the live merkado.cw production database.",
  },
  {
    term: "Harvest",
    tip: "One automated pass that downloads listings from a website and saves them.",
  },
  {
    term: "Snapshot",
    tip: "A frozen copy of what the website returned on that day — kept so we can re-check later.",
  },
  {
    term: "Normalized / cleaned data",
    tip: "Listings rewritten into one shared shape (price, beds, location…) so sources compare fairly.",
  },
  {
    term: "Cron",
    tip: "A timer expression. Example: 0 3 * * * = every day at 03:00 UTC.",
  },
  {
    term: "Supabase",
    tip: "The cloud Postgres database where merkado-labs stores cleaned listings.",
  },
] as const;

function StageCell({
  step,
}: {
  step: (typeof FLOW_STEPS)[number];
}) {
  const Icon = step.icon;
  return (
    <div className="relative flex min-w-0 flex-col overflow-hidden px-7 py-8">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-5 right-3 font-mono text-[92px] leading-none font-semibold tracking-tighter text-foreground/[0.04] select-none"
      >
        {step.step}
      </span>
      <div className="relative mb-5 flex size-11 items-center justify-center rounded-xl border bg-muted/50">
        <Icon className="size-5 text-foreground" strokeWidth={1.5} />
      </div>
      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground/70 uppercase">
        Stage {step.step}
      </p>
      <h3 className="mt-1.5 text-[15px] font-semibold tracking-tight">
        {step.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {step.detail}
      </p>
    </div>
  );
}

function StageConnector({ label }: { label: string }) {
  return (
    <div aria-hidden className="flex flex-col items-center self-stretch">
      <div className="w-px flex-1 bg-border" />
      <div className="flex flex-col items-center gap-1 py-2.5">
        <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
          {label}
        </span>
        <ChevronRight className="size-3 text-muted-foreground/60" />
      </div>
      <div className="w-px flex-1 bg-border" />
    </div>
  );
}

function DataJourney() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b bg-muted/40 px-7 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              The data journey
              <HelpTip label="data journey">
                Follow the numbered stages left to right. The small words
                between stages are the hand-off from one to the next.
              </HelpTip>
            </CardTitle>
            <CardDescription className="max-w-xl">
              How a public listing becomes something you can browse here.
            </CardDescription>
          </div>
          <p className="hidden shrink-0 pt-1 font-mono text-[10px] tracking-[0.18em] text-muted-foreground/70 uppercase sm:block">
            4 stages
          </p>
        </div>
      </CardHeader>

      <CardContent className="px-0 py-0">
        {/* Desktop: horizontal flow with hairline connectors */}
        <ol className="hidden lg:grid lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          {FLOW_STEPS.map((step) => (
            <li key={step.title} className="contents">
              <StageCell step={step} />
              {step.nextAction ? (
                <StageConnector label={step.nextAction} />
              ) : null}
            </li>
          ))}
        </ol>

        {/* Mobile / tablet: vertical flow */}
        <ol className="lg:hidden">
          {FLOW_STEPS.map((step) => (
            <li key={step.title}>
              <StageCell step={step} />
              {step.nextAction ? (
                <div
                  aria-hidden
                  className="flex items-center gap-3 border-y bg-muted/30 px-7 py-2"
                >
                  <ChevronDown className="size-3 text-muted-foreground/60" />
                  <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
                    {step.nextAction}
                  </span>
                </div>
              ) : null}
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-3 border-t bg-muted/40 px-7 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Stage 02</span>
            {" "}runs every day at{" "}
            <span className="font-medium text-foreground">03:00 UTC</span>
            {" "}via GitHub Actions
            <span className="mx-1.5 text-border">·</span>
            <span className="font-mono text-xs">0 3 * * *</span>
          </p>
          <Link
            href="/sources"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            View sources & schedules
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="How it works"
        description="A plain-language tour of this repo: where data comes from, how it gets into merkado-labs, and where to look when something breaks."
        icon={BookOpen}
      />

      <Card>
        <CardHeader>
          <CardTitle>In one sentence</CardTitle>
          <CardDescription>
            We download public property ads on a schedule, keep a private copy of
            the raw download, store a cleaned version in the merkado-labs
            database, and explore that cleaned version here.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This dashboard never talks to production Merkado. It only reads the
          merkado-labs project (
          <span className="font-mono text-xs">csaefdkpwukshtouyixg</span>
          ).
        </CardContent>
      </Card>

      <DataJourney />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="size-4 text-muted-foreground" />
              Important folders
            </CardTitle>
            <CardDescription>
              Where to look in the repo when you need to change behaviour.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {FOLDERS.map((folder) => (
              <div key={folder.path} className="space-y-0.5">
                <p className="font-mono text-xs text-foreground">
                  {folder.path}
                </p>
                <p className="text-sm text-muted-foreground">{folder.plain}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-4 text-muted-foreground" />
              Common tasks
            </CardTitle>
            <CardDescription>
              Quick pointers for running, debugging, and extending.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <Rocket className="size-3.5 text-muted-foreground" />
                Run this dashboard locally
              </p>
              <p className="text-muted-foreground">
                From{" "}
                <span className="font-mono text-xs">apps/labs-dashboard</span>
                : set merkado-labs{" "}
                <span className="font-mono text-xs">.env.local</span> keys, then{" "}
                <span className="font-mono text-xs">npm run dev</span>.
              </p>
            </div>
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <Terminal className="size-3.5 text-muted-foreground" />
                Run an adapter by hand
              </p>
              <p className="text-muted-foreground">
                Use the RE/MAX adapter under{" "}
                <span className="font-mono text-xs">
                  src/merkado_labs/scrapers/adapters/remax_curacao.py
                </span>{" "}
                in manual complete mode after a dry-run review. Scheduling stays off until QA passes.
              </p>
            </div>
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <Bug className="size-3.5 text-muted-foreground" />
                Something looks wrong
              </p>
              <p className="text-muted-foreground">
                Check{" "}
                <Link href="/data-quality" className="underline-offset-2 hover:underline">
                  Data quality
                </Link>{" "}
                and{" "}
                <Link href="/sources" className="underline-offset-2 hover:underline">
                  Sources
                </Link>{" "}
                for run health and last-seen times.
              </p>
            </div>
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <GitBranch className="size-3.5 text-muted-foreground" />
                Add a new source later
              </p>
              <p className="text-muted-foreground">
                Add scrape + import scripts, a migration if the schema needs it,
                a workflow for the schedule, and a row in the harvest catalog so
                Sources stays accurate.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Words you might see</CardTitle>
          <CardDescription>
            Hover the ? for a short explanation. Full detail stays in the docs
            folder when you need it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GLOSSARY.map((item) => (
              <div
                key={item.term}
                className="flex items-start justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2.5"
              >
                <span className="text-sm font-medium">{item.term}</span>
                <HelpTip label={item.term}>{item.tip}</HelpTip>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
