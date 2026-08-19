import Link from "next/link";

export function PayHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-3 px-4">
        <Link href="/pay" className="text-sm font-semibold tracking-tight">
          Merkado Pay
        </Link>
        <Link
          href="/"
          className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Demo
        </Link>
      </div>
    </header>
  );
}
