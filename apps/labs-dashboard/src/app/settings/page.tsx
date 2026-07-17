import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <div className="space-y-6">
    <PageHeader title="Labs settings" description="Configuration guide only. Secret values are never displayed." icon={Settings} />
    <Card><CardHeader><CardTitle>Required server configuration</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground">
      <p><code>LABS_ADMIN_SECRET</code> gates shared Labs admin actions. This preview uses a shared secret, not individual user accounts.</p>
      <p><code>SUPABASE_SECRET_KEY</code> (or <code>SUPABASE_SERVICE_ROLE_KEY</code>) is server-only and must target Labs project <code>csaefdkpwukshtouyixg</code>.</p>
      <p><code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> support public-safe reads only.</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>AI enrichment</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground">
      <p><code>OPENAI_API_KEY</code> and <code>OPENAI_ENRICHMENT_MODEL</code> are consumed by the Python worker, never by the browser.</p>
      <p>AI proposals require review and never overwrite source listing facts.</p>
    </CardContent></Card>
  </div>;
}
