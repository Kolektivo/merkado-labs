import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDemoGateState, safeReturnPath } from "@/lib/demo-gate";
import { isDemoUnlocked, redirectEnterIfNotNeeded } from "@/lib/demo-gate-server";
import { WalletIdentity } from "@/components/wallet-identity";

import { EnterForm } from "./enter-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Enter" };

export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [params] = await Promise.all([
    searchParams,
    redirectEnterIfNotNeeded(),
  ]);
  const state = getDemoGateState();
  const unlocked = await isDemoUnlocked();

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <main id="main-content" className="w-full max-w-sm" tabIndex={-1}>
        <Card>
          <CardHeader>
            <CardTitle>Merkado Labs</CardTitle>
            <CardDescription>
              {!unlocked && state.configured
                ? "Enter the shared password to open the demo."
                : !unlocked
                  ? "This walkthrough is locked until the host sets the shared password."
                  : "Sign in with your wallet to open the demo."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!unlocked && state.configured ? (
              <EnterForm nextPath={safeReturnPath(params.next)} />
            ) : unlocked ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Your wallet identity keeps this private walkthrough scoped to you.
                </p>
                <WalletIdentity nextPath={safeReturnPath(params.next)} />
              </div>
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
