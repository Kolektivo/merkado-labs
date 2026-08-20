import type { ReactNode } from "react";

import { redirectIfDemoLocked } from "@/lib/demo-gate-server";
import { ReownShell } from "@/lib/pay/reown-provider";

import { PayHeader } from "./pay-header";
import { PayerLocaleProvider } from "./payer-locale";

export const dynamic = "force-dynamic";

export default async function PayLayout({
  children,
}: {
  children: ReactNode;
}) {
  await redirectIfDemoLocked();
  return (
    <div className="theme-merkado min-h-screen">
      <PayHeader />
      <main id="main-content" className="mx-auto w-full max-w-lg px-4 py-6">
        <ReownShell>
          <PayerLocaleProvider>{children}</PayerLocaleProvider>
        </ReownShell>
      </main>
    </div>
  );
}
