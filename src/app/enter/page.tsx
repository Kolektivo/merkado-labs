import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDemoGateState, safeReturnPath } from "@/lib/demo-gate";
import { isDemoUnlocked } from "@/lib/demo-gate-server";
import { getOptionalUser } from "@/lib/supabase/server-client";

import { EnterForm } from "./enter-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Enter" };

async function getEnterAuthState(): Promise<{
  available: boolean;
  authenticated: boolean;
}> {
  try {
    const user = await getOptionalUser();
    return { available: true, authenticated: Boolean(user) };
  } catch {
    return { available: false, authenticated: false };
  }
}

export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; email?: string }>;
}) {
  const [params, authState, state, gateUnlocked] = await Promise.all([
    searchParams,
    getEnterAuthState(),
    Promise.resolve(getDemoGateState()),
    isDemoUnlocked(),
  ]);
  const nextPath = safeReturnPath(params.next);
  const deploymentGatePassed = !state.active || gateUnlocked;

  if (authState.authenticated && deploymentGatePassed) {
    redirect(nextPath || "/");
  }

  const error = typeof params.error === "string" ? params.error : null;
  const email = typeof params.email === "string" ? params.email : null;
  const authAvailable = authState.available && deploymentGatePassed;
  const showLegacyPassword = state.configured && !gateUnlocked;

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <main id="main-content" className="w-full max-w-sm" tabIndex={-1}>
        <Card>
          <CardHeader>
            <CardTitle>Merkado Labs</CardTitle>
            <CardDescription>
              {authAvailable
                ? "Sign in to open the demo walkthrough."
                : !authState.available
                  ? "Labs sign-in is temporarily unavailable. Check the Supabase publishable key."
                : showLegacyPassword
                  ? "Enter the shared password to open the demo."
                  : "This walkthrough is locked until the host sets the shared password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {authAvailable || showLegacyPassword ? (
              <EnterForm
                nextPath={nextPath}
                authAvailable={authAvailable}
                legacyPasswordAvailable={showLegacyPassword}
                initialError={error}
                initialEmail={email}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask the host if you need access.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
