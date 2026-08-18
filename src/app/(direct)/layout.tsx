import { AppShell } from "@/components/app-shell";

export default function DirectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
