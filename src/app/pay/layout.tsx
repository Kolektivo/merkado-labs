import Link from "next/link";

import { PayerLocaleProvider } from "./payer-locale";

export default function PayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="theme-merkado min-h-screen">
      <header className="border-b px-4 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <Link href="/pay" className="text-sm font-semibold">
            Merkado Pay
          </Link>
          <Link
            href="/"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Back to demo
          </Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-md px-4 py-6">
        <PayerLocaleProvider>{children}</PayerLocaleProvider>
      </main>
    </div>
  );
}
