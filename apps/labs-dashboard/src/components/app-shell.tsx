"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  FileSearch,
  GitCompareArrows,
  LayoutDashboard,
  MapPinned,
  Radio,
  Route,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Users,
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
    label: "Explore",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/listings", label: "Listings", icon: Building2 },
      { href: "/browse", label: "Public browse", icon: FileSearch },
      { href: "/realtors", label: "Realtors", icon: Users },
      { href: "/map", label: "Map", icon: MapPinned },
      { href: "/neighbourhoods", label: "Neighbourhoods", icon: BarChart3 },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/sources", label: "Sources", icon: Radio },
      { href: "/enrichment", label: "AI enrichment", icon: GitCompareArrows },
      { href: "/source-runs", label: "Source runs", icon: Route },
      { href: "/eligibility", label: "Eligibility", icon: SlidersHorizontal },
      { href: "/lifecycle", label: "Lifecycle", icon: ClipboardList },
      { href: "/search-requests", label: "Search requests", icon: FileSearch },
      { href: "/what-fits-me", label: "What fits me", icon: Building2 },
      { href: "/agent", label: "Merkado Agent", icon: Settings },
      { href: "/data-quality", label: "Data quality", icon: ShieldAlert },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Guide",
    items: [
      { href: "/how-it-works", label: "How it works", icon: BookOpen },
    ],
  },
];

const navigation: NavItem[] = navigationSections.flatMap(
  (section) => section.items,
);

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolveCrumbs(pathname: string) {
  if (pathname === "/") {
    return [{ label: "Overview", href: null as string | null }];
  }

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string | null }[] = [
    { label: "Overview", href: "/" },
  ];

  let path = "";
  for (const [index, segment] of segments.entries()) {
    path += `/${segment}`;
    const known = navigation.find((item) => item.href === path);
    const isLast = index === segments.length - 1;
    const looksLikeId =
      /^[0-9a-f-]{8,}$/i.test(segment) || /^\d+$/.test(segment);
    crumbs.push({
      label: known?.label ?? (looksLikeId ? "Detail" : decodeURIComponent(segment)),
      href: isLast ? null : path,
    });
  }

  return crumbs;
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
                    >
                      <Link href={href}>
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
      </SidebarContent>

      <SidebarFooter>
        <div className="flex flex-col gap-1.5 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="size-1.5 rounded-full bg-neutral-300" />
            merkado-labs sandbox
          </div>
          <p className="text-[11px] leading-4 text-sidebar-foreground/55">
            Safe experiment data only. Original scrape files stay private.
          </p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function SiteHeader() {
  const pathname = usePathname();
  const crumbs = resolveCrumbs(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 overflow-hidden border-b bg-background/90 px-4 backdrop-blur supports-backdrop-filter:bg-background/75 md:px-6">
      <SidebarTrigger className="-ml-1 shrink-0" />
      <Breadcrumb className="min-w-0 flex-1 overflow-hidden">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, index) => (
            <div key={`${crumb.label}-${index}`} className="contents">
              {index > 0 ? (
                <BreadcrumbSeparator className="hidden shrink-0 sm:block" />
              ) : null}
              <BreadcrumbItem
                className={
                  index === 0 && crumbs.length > 1
                    ? "hidden sm:inline-flex"
                    : "min-w-0"
                }
              >
                {crumb.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate">
                    {crumb.label}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </div>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto hidden shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground sm:flex">
        <span className="size-1.5 rounded-full bg-neutral-500" />
        <span>Connected to merkado-labs</span>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <SiteHeader />
        <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
          <main className="mx-auto w-full min-w-0 max-w-[1480px] flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-8">
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
