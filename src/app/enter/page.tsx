import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDemoGateState, safeReturnPath } from "@/lib/demo-gate";
import { redirectEnterIfNotNeeded } from "@/lib/demo-gate-server";

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

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <main id="main-content" className="w-full max-w-sm" tabIndex={-1}>
        <Card>
          <CardHeader>
            <CardTitle>Merkado Labs</CardTitle>
            <CardDescription>
              {state.configured
                ? "Enter the shared password to open the demo."
                : "This walkthrough is locked until the host sets the shared password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state.configured ? (
              <EnterForm nextPath={safeReturnPath(params.next)} />
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
