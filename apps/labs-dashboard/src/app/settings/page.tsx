import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { LabsAdminLogin } from "@/components/labs-admin-login";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasLabsAdminSession } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const hasSession = await hasLabsAdminSession();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Labs settings"
        description="Internal Labs configuration. Secret values are never displayed. Not production auth."
        icon={Settings}
      />
      <Card>
        <CardHeader>
          <CardTitle>Labs admin session</CardTitle>
        </CardHeader>
        <CardContent>
          <LabsAdminLogin hasSession={hasSession} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Required server configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <code>LABS_ADMIN_SECRET</code> is server-only. Login issues a signed
            httpOnly sameSite cookie — the secret must not live in client state,
            localStorage, or rendered HTML.
          </p>
          <p>
            <code>SUPABASE_SECRET_KEY</code> (or <code>SUPABASE_SERVICE_ROLE_KEY</code>)
            is server-only and must target Labs project{" "}
            <code>csaefdkpwukshtouyixg</code>.
          </p>
          <p>
            Anon/publishable keys may only read <code>public_property_listings</code>,
            not full internal tables.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>AI enrichment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <code>OPENAI_API_KEY</code>, <code>OPENAI_ENRICHMENT_MODEL</code>,{" "}
            <code>OPENAI_ENRICHMENT_REASONING_EFFORT</code>,{" "}
            <code>OPENAI_ENRICHMENT_MAX_OUTPUT_TOKENS</code>, and{" "}
            <code>OPENAI_ENRICHMENT_BATCH_SIZE</code> are consumed by the Python
            worker only. No silent model fallback.
          </p>
          <p>AI proposals require review and never overwrite source listing facts.</p>
        </CardContent>
      </Card>
    </div>
  );
}
