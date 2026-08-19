import type { ReactNode } from "react";

import { ThemeMerkado } from "@/components/theme-merkado";
import { redirectIfDemoLocked } from "@/lib/demo-gate-server";

import { AccountBreadcrumb } from "./account-breadcrumb";
import { AccountFooter } from "./account-footer";
import { AccountNavbar } from "./account-navbar";
import { AccountSidebar } from "./account-sidebar";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  await redirectIfDemoLocked();
  return (
    <ThemeMerkado className="account-shell flex min-h-screen min-h-dvh flex-col bg-background">
      <div className="flex min-h-0 flex-1 flex-col">
        <AccountNavbar />
        <main id="main-content" className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col bg-background">
            <div className="mx-auto w-full max-w-[1030px] flex-1 px-4 pt-0 pb-4">
              <div className="mb-4">
                <AccountBreadcrumb />
              </div>
              <div className="flex flex-col gap-4 md:grid md:grid-cols-[280px_minmax(0,1fr)] md:items-start">
                <AccountSidebar />
                <div className="flex w-full min-w-0 flex-col gap-4">{children}</div>
              </div>
            </div>
          </div>
        </main>
        <AccountFooter />
      </div>
    </ThemeMerkado>
  );
}
