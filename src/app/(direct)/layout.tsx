import { AppShell } from "@/components/app-shell";
import { redirectIfDemoLocked } from "@/lib/demo-gate-server";

export const dynamic = "force-dynamic";

export default async function DirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectIfDemoLocked();
  return <AppShell>{children}</AppShell>;
}
