import type { Metadata } from "next";
import { CheckCircle2, CircleX, Settings } from "lucide-react";

import { LabsAdminLogin } from "@/components/labs-admin-login";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasLabsAdminSession } from "@/lib/admin/auth";
import { getConfigurationHealth } from "@/lib/system/health";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const hasSession = await hasLabsAdminSession();
  const health = getConfigurationHealth();
  const checks = [
    ["Supabase configured", health.supabaseConfigured],
    ["Correct Labs project", health.correctLabsProject],
    ["Service credentials configured", health.serviceCredentialsConfigured],
    ["OpenAI configured", health.openAiConfigured],
    ["Admin authentication configured", health.adminAuthConfigured],
  ] as const;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Labs settings"
        description="Admin access, connection health, and the safety rules for this Labs workspace."
        icon={Settings}
      />
      <Card>
        <CardHeader>
          <CardTitle>Admin access</CardTitle>
        </CardHeader>
        <CardContent>
          <LabsAdminLogin hasSession={hasSession} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connection health</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {checks.map(([label, ok]) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              {ok ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <CircleX className="size-4 text-destructive" />
              )}
              <span>{label}: {ok ? "Yes" : "No"}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How data access works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Internal dashboard pages only load after an admin unlock. Public
            browse shows only the cleaned, public-safe listing view.
          </p>
          <p>
            Private ad snapshots, import details, AI suggestions, and prototype
            request data stay internal.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Current limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Automatic website updates are off. Imports run only when started by hand.</p>
          <p>Starting new AI jobs is off during cleanup; existing suggestions are review-only.</p>
          <p>Prototype property pages are Labs experiments, not live on merkado.cw.</p>
          <p>The allowed database project is <code>csaefdkpwukshtouyixg</code>. Production is forbidden.</p>
        </CardContent>
      </Card>
    </div>
  );
}
