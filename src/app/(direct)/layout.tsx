import { AppShell } from "@/components/app-shell";
import { redirectIfDemoLocked } from "@/lib/demo-gate-server";
import { dashboardNotifications } from "@/lib/rent-advance/notifications";
import { loadBook } from "@/lib/rent-advance/store";

export const dynamic = "force-dynamic";

export default async function DirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectIfDemoLocked();
  const book = await loadBook();
  return (
    <AppShell notifications={dashboardNotifications(book)}>{children}</AppShell>
  );
}
