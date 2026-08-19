import Image from "next/image";

import { PrototypeNotice } from "@/components/prototype-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  await redirectEnterIfNotNeeded();
  const params = await searchParams;
  const state = getDemoGateState();

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <PrototypeNotice>
        Private Labs walkthrough. Not live on merkado.cw. This is not a
        Merkado account.
      </PrototypeNotice>
      <Card>
        <CardHeader className="items-center text-center">
          <Image
            src="/cw-logo.png"
            alt="Merkado"
            width={40}
            height={40}
            className="size-10 rounded-md"
          />
          <CardTitle className="text-2xl">Merkado Labs</CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {state.configured
              ? "Enter the shared password to open the walkthrough."
              : "This private walkthrough is locked until the host sets the shared password."}
          </p>
        </CardHeader>
        <CardContent>
          <EnterForm
            nextPath={safeReturnPath(params.next)}
            configured={state.configured}
          />
        </CardContent>
      </Card>
    </div>
  );
}
