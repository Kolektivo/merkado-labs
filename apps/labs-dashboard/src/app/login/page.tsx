import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { LabsAdminLogin } from "@/components/labs-admin-login";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { hasLabsAdminSession } from "@/lib/admin/auth";
import { getConfigurationHealth } from "@/lib/system/health";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Labs admin login" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.next) ? params.next[0] : params.next;
  const returnTo = requested?.startsWith("/") ? requested : "/";
  const hasSession = await hasLabsAdminSession();
  if (hasSession) redirect(returnTo);

  const health = getConfigurationHealth();

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg border bg-muted">
            <LockKeyhole className="size-5" />
          </div>
          <h1 className="text-lg font-semibold">Merkado Property Labs</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to the internal dashboard. This shared Labs gate is separate
            from production Merkado.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {health.adminAuthConfigured ? (
            <LabsAdminLogin hasSession={false} returnTo={returnTo} />
          ) : (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              Admin authentication is not configured. Add the server-only Labs
              admin secret to the local dashboard environment, then restart.
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Public-safe prototype:{" "}
            <Link className="underline underline-offset-2" href="/browse">
              browse eligible listings
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
