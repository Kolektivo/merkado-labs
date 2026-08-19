import Image from "next/image";
import { Lock } from "lucide-react";

import { ThemeMerkado } from "@/components/theme-merkado";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
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
    <ThemeMerkado className="min-h-svh">
      <div className="mx-auto flex min-h-svh w-full max-w-[420px] flex-col justify-center px-4 py-12">
        <main
          id="main-content"
          className="flex flex-col items-center gap-6"
          tabIndex={-1}
        >
          <Image
            src="/cw-logo.png"
            alt="Merkado"
            width={48}
            height={48}
            priority
            className="size-12 rounded-[12px]"
          />

          <Card className="w-full shadow-sm">
            <CardHeader className="justify-items-center gap-3 text-center">
              <p className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                Private walkthrough
              </p>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Merkado Labs
                </h1>
                <CardDescription className="max-w-sm text-pretty leading-relaxed">
                  {state.configured
                    ? "Enter the shared password to open the demo."
                    : "This private walkthrough is locked until the host sets the shared password."}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {state.configured ? (
                <EnterForm nextPath={safeReturnPath(params.next)} />
              ) : (
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <div className="flex size-11 items-center justify-center rounded-full bg-muted">
                    <Lock
                      className="size-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Ask the host if you need access.
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-center text-center">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Not a Merkado account · Not live on merkado.cw
              </p>
            </CardFooter>
          </Card>
        </main>
      </div>
    </ThemeMerkado>
  );
}
