import { AppShell } from "@/components/app-shell";
import { redirectIfDemoLocked } from "@/lib/demo-gate-server";
import { dashboardNotifications } from "@/lib/rent-advance/notifications";
import { loadBook } from "@/lib/rent-advance/store";
import { getCurrentWalletIdentity } from "@/lib/wallet/identity";
import { isAdminWallet } from "@/lib/wallet/admin";

export const dynamic = "force-dynamic";

export default async function DirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectIfDemoLocked();
  const [book, identity] = await Promise.all([loadBook(), getCurrentWalletIdentity()]);
  return (
    <AppShell
      isAdmin={await isAdminWallet(identity?.address)}
      notifications={dashboardNotifications(book, identity?.address ?? null)}
    >
      {children}
    </AppShell>
  );
}
