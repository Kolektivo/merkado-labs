import { redirect } from "next/navigation";

import { OAuthConsentModule } from "@/components/auth/oauth-consent-module";
import { getOptionalUser } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Authorize application" };

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId || authorizationId.length > 512) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          This authorization request is missing or invalid.
        </p>
      </div>
    );
  }

  const user = await getOptionalUser();
  if (!user) {
    const nextPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/enter?next=${encodeURIComponent(nextPath)}`);
  }

  return <OAuthConsentModule authorizationId={authorizationId} />;
}
