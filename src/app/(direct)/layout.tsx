import { AppShell } from "@/components/app-shell";
import { isAdminEmail } from "@/lib/auth/admin";
import { profileFromUser } from "@/lib/auth/profile";
import { redirectIfDemoLocked } from "@/lib/demo-gate-server";
import { dashboardNotifications } from "@/lib/rent-advance/notifications";
import { loadBook } from "@/lib/rent-advance/store";
import { getOptionalUser } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";

export default async function DirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectIfDemoLocked();
  const user = await getOptionalUser();
  const book = await loadBook();
  return (
    <AppShell
      notifications={dashboardNotifications(book)}
      user={profileFromUser(user)}
      isAdmin={isAdminEmail(user?.email)}
    >
      {children}
    </AppShell>
  );
}
