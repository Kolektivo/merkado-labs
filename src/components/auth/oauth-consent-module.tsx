"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/browser-client";

const ALLOWED_SCOPES = new Set(["openid", "profile", "email"]);
const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm your account identity",
  profile: "Share your basic profile",
  email: "Share your email address",
};

type ConsentDetails = {
  authorization_id: string;
  client: {
    name: string;
    uri: string;
    logo_uri: string;
  };
  scope: string;
};

function parseScopes(scope: string): { allowed: string[]; unsupported: string[] } {
  const requested = [...new Set(scope.split(/\s+/).filter(Boolean))];
  return {
    allowed: requested.filter((item) => ALLOWED_SCOPES.has(item)),
    unsupported: requested.filter((item) => !ALLOWED_SCOPES.has(item)),
  };
}

export function OAuthConsentModule({ authorizationId }: { authorizationId: string }) {
  const [details, setDetails] = useState<ConsentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const supabase = createClient();
        const { data, error: detailsError } =
          await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (cancelled) return;
        if (detailsError || !data) {
          setError("This authorization request is invalid or has expired.");
          return;
        }
        if (!("authorization_id" in data)) {
          window.location.replace(data.redirect_url);
          return;
        }
        setDetails(data);
      } catch {
        if (!cancelled) setError("This authorization request is invalid or has expired.");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  async function decide(decision: "approve" | "deny") {
    if (!details || busy) return;
    setBusy(decision);
    setError(null);
    try {
      const { unsupported } = parseScopes(details.scope);
      if (decision === "approve" && unsupported.length > 0) {
        setError("This application requested permissions that are not available.");
        setBusy(null);
        return;
      }
      const supabase = createClient();
      const result =
        decision === "approve"
          ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
              skipBrowserRedirect: true,
            })
          : await supabase.auth.oauth.denyAuthorization(authorizationId, {
              skipBrowserRedirect: true,
            });
      if (result.error || !result.data?.redirect_url) {
        setError("The authorization request could not be completed. Please try again.");
        setBusy(null);
        return;
      }
      window.location.replace(result.data.redirect_url);
    } catch {
      setError("The authorization request could not be completed. Please try again.");
      setBusy(null);
    }
  }

  const scopes = details ? parseScopes(details.scope) : null;

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <main id="main-content" className="w-full max-w-md" tabIndex={-1}>
        <Card>
          <CardHeader>
            <CardTitle>Authorize application</CardTitle>
            <CardDescription>
              {details
                ? `${details.client.name} is requesting access to your Labs account.`
                : "Reviewing the authorization request…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertTitle>Authorization unavailable</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {details && scopes ? (
              <>
                <div className="rounded-xl border bg-card p-4">
                  <p className="font-medium">{details.client.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You are signed in to your private Labs account.
                  </p>
                </div>
                {scopes.allowed.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium">This application will receive</p>
                    <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                      {scopes.allowed.map((scope) => (
                        <li key={scope}>• {SCOPE_LABELS[scope]}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {scopes.unsupported.length > 0 ? (
                  <Alert variant="destructive">
                    <AlertTitle>Additional permission required</AlertTitle>
                    <AlertDescription>
                      This request includes permissions that are not available in
                      the Labs walkthrough.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void decide("deny")}
                  >
                    {busy === "deny" ? "Declining…" : "Deny"}
                  </Button>
                  <Button
                    type="button"
                    disabled={busy !== null || scopes.unsupported.length > 0}
                    onClick={() => void decide("approve")}
                  >
                    {busy === "approve" ? "Approving…" : "Approve"}
                  </Button>
                </div>
              </>
            ) : !error ? (
              <p className="text-sm text-muted-foreground" role="status">
                Loading authorization details…
              </p>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
