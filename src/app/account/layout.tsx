import Link from "next/link";

import { ThemeMerkado } from "@/components/theme-merkado";

import { AccountNav } from "./account-nav";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeMerkado className="min-h-screen px-4 py-5 md:px-6">
      <div className="mx-auto grid w-full max-w-[1030px] gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="account-sidebar">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Demo account
          </p>
          <p className="mt-2 text-lg font-semibold">L. Rosaria</p>
          <p className="text-sm text-muted-foreground">Fictional Labs renter</p>
          <AccountNav />
          <Link
            href="/"
            className="mt-6 inline-block text-sm underline underline-offset-2"
          >
            Back to demo
          </Link>
        </aside>
        <div>
          <header className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Merkado account</p>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">
              Demo account
            </span>
          </header>
          <main id="main-content">{children}</main>
        </div>
      </div>
    </ThemeMerkado>
  );
}
