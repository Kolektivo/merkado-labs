import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { LabsAdminLogin } from "@/components/labs-admin-login";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { hasLabsAdminSession } from "@/lib/admin/auth";
import { getConfigurationHealth } from "@/lib/system/health";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const hasSession = await hasLabsAdminSession();
  const health = getConfigurationHealth();
  const checks = [
    ["Database connection", health.supabaseConfigured],
    ["Labs project boundary", health.correctLabsProject],
    ["Server credentials", health.serviceCredentialsConfigured],
    ["AI configuration", health.openAiConfigured],
    ["Admin access", health.adminAuthConfigured],
    ["GitHub repository target", health.githubRepositoryConfigured],
    ["Manual Run now dispatch", health.githubDispatchConfigured],
  ] as const;
  const model = process.env.OPENAI_ENRICHMENT_MODEL ?? "gpt-5.6-terra";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Settings"
        description="Access, safety boundaries, and read-only system information for Property Labs."
        icon={Settings}
      />

      <section aria-labelledby="settings-access-heading">
        <div className="mb-3">
          <h2 id="settings-access-heading" className="text-lg font-semibold">
            Access
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage this browser&apos;s internal Labs session.
          </p>
        </div>
        <Card>
          <CardContent>
            <LabsAdminLogin hasSession={hasSession} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="settings-safety-heading">
        <div className="mb-3">
          <h2 id="settings-safety-heading" className="text-lg font-semibold">
            Safety boundaries
          </h2>
          <p className="text-sm text-muted-foreground">
            Current operational limits. These settings are not editable here.
          </p>
        </div>
        <Card className="gap-0 py-0">
          <CardContent className="divide-y px-0">
            {[
              [
                "Website refreshes",
                "Daily + manual",
                "Cron at 06:00 Curaçao for the four Ready sources; Run now when dispatch credentials are set.",
              ],
              [
                "AI enrichment",
                "Daily + manual",
                "New/changed listings only, within USD 2/day and USD 25/month.",
              ],
              [
                "Environment",
                "Labs only",
                "Production data and configuration are forbidden.",
              ],
              [
                "Public preview",
                "Experimental",
                "Prototype pages are not live on merkado.cw.",
              ],
              [
                "AI model",
                model,
                "Protected source facts are never overwritten.",
              ],
            ].map(([label, value, helper]) => (
              <div
                key={label}
                className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-5"
              >
                <div>
                  <h3 className="font-medium">{label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{helper}</p>
                </div>
                <StatusBadge tone="neutral">{value}</StatusBadge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-medium">
          System information
        </summary>
        <div className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Read-only configuration checks. Values and secrets are never shown.
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            {checks.map(([label, ok]) => (
              <div key={label} className="rounded-lg bg-muted/35 p-3 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1">
                  <StatusBadge tone={ok ? "success" : "error"}>
                    {ok ? "Configured" : "Needs setup"}
                  </StatusBadge>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Allowed Labs project: csaefdkpwukshtouyixg. Service credentials and
            private source evidence remain server-only.
          </p>
        </div>
      </details>
    </div>
  );
}
