"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Home,
  LayoutDashboard,
  LineChart,
  Plus,
  Shield,
  Store,
  UserRound,
  Wallet,
} from "lucide-react";

import {
  DashboardNotifications,
  useNavNotificationCounts,
} from "@/components/dashboard-notifications";
import type { DashboardNotification } from "@/lib/rent-advance/notifications";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { resolveCrumbs, type BreadcrumbCrumb } from "@/lib/breadcrumbs";
import { cn } from "@/lib/utils";
import { WalletIdentity } from "@/components/wallet-identity";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const productNav: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/originate", label: "My Offers", icon: Home },
  { href: "/originate/new", label: "Create Offer", icon: Plus },
  { href: "/originate/simulator", label: "Simulator", icon: LineChart },
  { href: "/offers", label: "Marketplace", icon: Store },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
];

const utilityNav: NavItem[] = [
  { href: "/pay", label: "Merkado Pay", icon: Wallet },
  { href: "/account", label: "Account", icon: UserRound },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === href;
  if (href === "/originate") {
    return pathname === "/originate" || /^\/originate\/MRA-/.test(pathname);
  }
  if (href === "/admin") {
    return pathname === "/admin" || pathname.startsWith("/admin/");
  }
  if (href === "/pay") {
    return pathname === "/pay" || pathname.startsWith("/pay/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  items,
  pathname,
  counts,
}: {
  items: NavItem[];
  pathname: string;
  counts: { originate: number; portfolio: number };
}) {
  return (
    <SidebarMenu>
      {items.map(({ href, label, icon: Icon }) => {
        const count =
          href === "/originate"
            ? counts.originate
            : href === "/portfolio"
              ? counts.portfolio
              : 0;
        return (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton
              asChild
              isActive={isActivePath(pathname, href)}
              tooltip={count ? `${label}, ${count} updates` : label}
              className={cn("min-h-9", count > 0 && "pr-8")}
            >
              <Link
                href={href}
                aria-current={isActivePath(pathname, href) ? "page" : undefined}
                aria-label={
                  count ? `${label}, ${count} updates` : undefined
                }
              >
                <Icon />
                <span>{label}</span>
              </Link>
            </SidebarMenuButton>
            {count > 0 ? (
              <SidebarMenuBadge className="bg-primary text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-active/menu-button:text-primary-foreground">
                {count}
              </SidebarMenuBadge>
            ) : null}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function AppSidebar({
  notifications,
}: {
  notifications: DashboardNotification[];
}) {
  const pathname = usePathname() ?? "";
  const counts = useNavNotificationCounts(notifications);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Merkado Direct">
              <Link href="/">
                <Image
                  src="/cw-logo.png"
                  alt="Merkado"
                  width={32}
                  height={32}
                  className="size-8 shrink-0 rounded-md"
                  priority
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Merkado Direct</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    Rent paid forward
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Primary navigation">
          <SidebarGroup>
            <SidebarGroupLabel>Merkado Direct</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavLinks items={productNav} pathname={pathname} counts={counts} />
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>More</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavLinks items={utilityNav} pathname={pathname} counts={counts} />
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActivePath(pathname, "/admin")}
              tooltip="Admin"
              className="min-h-9"
            >
              <Link
                href="/admin"
                aria-current={isActivePath(pathname, "/admin") ? "page" : undefined}
              >
                <Shield />
                <span>Admin</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function BreadcrumbTrail({ crumbs }: { crumbs: BreadcrumbCrumb[] }) {
  return (
    <Breadcrumb className="min-w-0 flex-1 overflow-hidden">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => (
          <div key={`${crumb.href ?? crumb.label}-${index}`} className="contents">
            {index > 0 ? (
              <BreadcrumbSeparator className="hidden shrink-0 sm:block" />
            ) : null}
            <BreadcrumbItem
              className={index < crumbs.length - 1 ? "hidden sm:inline-flex" : "min-w-0"}
            >
              {crumb.href ? (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate" title={crumb.label}>
                  {crumb.label}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function SiteHeader({
  notifications,
}: {
  notifications: DashboardNotification[];
}) {
  const pathname = usePathname() ?? "";
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur supports-backdrop-filter:bg-background/75 md:px-6">
      <SidebarTrigger className="-ml-1 shrink-0" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <BreadcrumbTrail crumbs={resolveCrumbs(pathname)} />
      </div>
      <WalletIdentity className="hidden sm:block" />
      <DashboardNotifications items={notifications} />
    </header>
  );
}

export function AppShell({
  children,
  notifications,
}: {
  children: React.ReactNode;
  notifications: DashboardNotification[];
}) {
  return (
    <SidebarProvider>
      <AppSidebar notifications={notifications} />
      <SidebarInset className="min-w-0">
        <SiteHeader notifications={notifications} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main
            id="main-content"
            className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 px-4 py-5 md:px-6 md:py-7 lg:px-8"
          >
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
