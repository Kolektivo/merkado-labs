"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Briefcase,
  Home,
  LayoutDashboard,
  LineChart,
  Plus,
  UserRound,
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
  SidebarFooter,
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
import { resolveCrumbs, type BreadcrumbCrumb } from "@/lib/breadcrumbs";

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
    label: "Demo",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/account/payments", label: "Account", icon: UserRound },
    ],
  },
  {
    label: "Merkado Direct",
    items: [
      { href: "/originate", label: "My Offers", icon: Home },
      { href: "/originate/new", label: "Create Offer", icon: Plus },
      { href: "/originate/simulator", label: "Get Now", icon: LineChart },
      { href: "/offers", label: "Marketplace", icon: BookOpen },
      { href: "/portfolio", label: "Portfolio", icon: Briefcase },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === href;
  if (href === "/originate") {
    return pathname === "/originate" || /^\/originate\/MRA-/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AppSidebar() {
  const pathname = usePathname() ?? "";

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Merkado Labs">
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
                  <span className="truncate font-semibold">Merkado Labs</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    {pathname.startsWith("/account")
                      ? "Demo account"
                      : pathname.startsWith("/pay")
                        ? "Merkado Pay"
                        : "Merkado Direct"}
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
      <SidebarFooter>
        <div className="hidden px-2 text-[11px] leading-relaxed text-sidebar-foreground/60 md:block">
          Demo · sale of receivables, not a loan
        </div>
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

function SiteHeader() {
  const pathname = usePathname() ?? "";
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 overflow-hidden border-b bg-background/90 px-4 backdrop-blur supports-backdrop-filter:bg-background/75 md:px-6">
      <SidebarTrigger className="-ml-1 shrink-0" />
      <BreadcrumbTrail crumbs={resolveCrumbs(pathname)} />
      <p className="ml-auto hidden shrink-0 text-xs font-medium text-muted-foreground sm:block">
        Labs demo · not live on merkado.cw
      </p>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <SiteHeader />
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
