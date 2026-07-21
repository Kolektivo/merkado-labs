"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Eye,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  Radio,
  RefreshCw,
  Settings,
  ShieldAlert,
} from "lucide-react";

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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  isPrototypePath,
  resolveCrumbs,
  type BreadcrumbCrumb,
} from "@/lib/breadcrumbs";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navigationSections: NavSection[] = [
  {
    label: "Monitor",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/listings", label: "Listings", icon: Building2 },
      { href: "/sources", label: "Sources", icon: Radio },
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/data-operations", label: "Data operations", icon: RefreshCw },
      { href: "/enrichment", label: "AI enrichment", icon: GitCompareArrows },
      { href: "/quality", label: "Data quality", icon: ShieldAlert },
    ],
  },
  {
    label: "Explore",
    items: [
      { href: "/browse", label: "Public preview", icon: Eye },
      { href: "/prototypes", label: "Prototypes", icon: FlaskConical },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === href;
  if (href === "/prototypes" && isPrototypePath(pathname)) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="merkado-labs">
              <Link href="/">
                <Image
                  src="/cw-logo.png"
                  alt="Curaçao Wire"
                  width={32}
                  height={32}
                  className="size-8 shrink-0 rounded-md"
                  priority
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">merkado-labs</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    Property intelligence
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Primary navigation">
          {navigationSections.map((section) => (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map(({ href, label, icon: Icon }) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActivePath(pathname, href)}
                        tooltip={label}
                        className="min-h-9"
                      >
                        <Link
                          href={href}
                          aria-current={
                            isActivePath(pathname, href) ? "page" : undefined
                          }
                        >
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

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
              className={
                index < crumbs.length - 1
                  ? "hidden sm:inline-flex"
                  : "min-w-0"
              }
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

function SiteHeaderBreadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return <BreadcrumbTrail crumbs={resolveCrumbs(pathname, searchParams)} />;
}

function SiteHeaderBreadcrumbsFallback() {
  const pathname = usePathname();
  return <BreadcrumbTrail crumbs={resolveCrumbs(pathname)} />;
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 overflow-hidden border-b bg-background/90 px-4 backdrop-blur supports-backdrop-filter:bg-background/75 md:px-6">
      <SidebarTrigger className="-ml-1 shrink-0" />
      <Suspense fallback={<SiteHeaderBreadcrumbsFallback />}>
        <SiteHeaderBreadcrumbs />
      </Suspense>
      <div className="ml-auto flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="size-1.5 rounded-full bg-neutral-500" />
        <span className="hidden sm:inline">Labs sandbox · manual operations</span>
        <span className="sr-only sm:hidden">Labs sandbox</span>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return (
      <main id="main-content" className="min-h-screen px-4 py-8">
        {children}
      </main>
    );
  }

  if (pathname === "/browse" || pathname.startsWith("/browse/")) {
    return (
      <main id="main-content" className="min-h-screen px-4 py-8 md:px-6">
        {children}
      </main>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <SiteHeader />
        <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
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
