export type BreadcrumbCrumb = {
  label: string;
  href: string | null;
};

const ROUTE_LABELS: Record<string, string> = {
  "/originate": "My Offers",
  "/originate/new": "Create offer",
  "/originate/simulator": "Get Now",
  "/offers": "Marketplace",
  "/portfolio": "Portfolio",
  "/pay": "Merkado Pay",
  "/account": "Account",
  "/account/payments": "My Payments",
  "/account/apps": "Apps",
};

export function resolveCrumbs(pathname: string): BreadcrumbCrumb[] {
  if (pathname === "/") {
    return [{ label: "Overview", href: null }];
  }

  const crumbs: BreadcrumbCrumb[] = [{ label: "Overview", href: "/" }];
  const segments = pathname.split("/").filter(Boolean);
  let path = "";
  for (const [index, segment] of segments.entries()) {
    path += `/${segment}`;
    const isLast = index === segments.length - 1;
    crumbs.push({
      label: ROUTE_LABELS[path] ?? (segment.startsWith("MRA-") ? segment : title(segment)),
      href: isLast ? null : path,
    });
  }
  return crumbs;
}

function title(value: string) {
  return decodeURIComponent(value)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
