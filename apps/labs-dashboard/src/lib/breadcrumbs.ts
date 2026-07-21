export type BreadcrumbCrumb = {
  label: string;
  href: string | null;
};

export type ListingNavContext = {
  from?: string | null;
  fromId?: string | null;
  returnTo?: string | null;
};

const ROUTE_LABELS: Record<string, string> = {
  "/quality": "Data quality",
  "/listings": "Listings",
  "/data-operations": "Data operations",
  "/sources": "Sources",
  "/enrichment": "AI enrichment",
  "/settings": "Settings",
  "/prototypes": "Prototypes",
  "/browse": "Public preview",
  "/search-requests": "Search requests",
  "/what-fits-me": "What Fits Me?",
  "/agent": "Merkado Agent",
};

const PROTOTYPE_ROOTS = [
  "/search-requests",
  "/what-fits-me",
  "/agent",
  "/match-reports",
] as const;

const LISTING_FROM_CONTEXTS: Record<
  string,
  {
    label: string;
    href: string;
    prototypes?: boolean;
  }
> = {
  enrichment: { label: "AI enrichment", href: "/enrichment" },
  quality: { label: "Data quality", href: "/quality" },
  sources: { label: "Sources", href: "/sources" },
  "match-reports": {
    label: "Match report",
    href: "/search-requests",
    prototypes: true,
  },
  "search-requests": {
    label: "Search requests",
    href: "/search-requests",
    prototypes: true,
  },
  browse: { label: "Public preview", href: "/browse" },
};

function isIdSegment(segment: string) {
  return /^[0-9a-f-]{8,}$/i.test(segment) || /^\d+$/.test(segment);
}

function humanizeSegment(segment: string) {
  return decodeURIComponent(segment)
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function dynamicSegmentLabel(parentPath: string, segment: string) {
  if (parentPath === "/listings" || parentPath === "/browse") {
    return "Listing";
  }
  if (parentPath === "/sources") {
    return humanizeSegment(segment);
  }
  if (parentPath === "/match-reports") {
    return "Match report";
  }
  if (isIdSegment(segment)) {
    return "Detail";
  }
  return humanizeSegment(segment);
}

export function isPrototypePath(pathname: string) {
  return PROTOTYPE_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

/** Build a listing detail URL that preserves breadcrumb/back context. */
export function listingDetailHref(
  listingId: string,
  context?: {
    from?: string;
    fromId?: string;
    returnTo?: string;
    tab?: string;
  },
): string {
  const params = new URLSearchParams();
  if (context?.from) params.set("from", context.from);
  if (context?.fromId) params.set("fromId", context.fromId);
  if (context?.returnTo) params.set("returnTo", context.returnTo);
  if (context?.tab) params.set("tab", context.tab);
  const query = params.toString();
  return query ? `/listings/${listingId}?${query}` : `/listings/${listingId}`;
}

/** Back-link target for the listing detail page header. */
export function resolveListingBackNav(context: ListingNavContext = {}): {
  href: string;
  label: string;
} {
  const from = context.from?.trim() || null;
  const fromId = context.fromId?.trim() || null;
  const returnTo = context.returnTo?.trim() || null;
  if (returnTo && /^\/listings(?:\?|$)/.test(returnTo)) {
    return { href: returnTo, label: "Back to listing results" };
  }

  switch (from) {
    case "enrichment":
      return { href: "/enrichment", label: "Back to AI enrichment" };
    case "quality":
      return { href: "/quality", label: "Back to data quality" };
    case "sources":
      return {
        href: fromId ? `/sources/${encodeURIComponent(fromId)}` : "/sources",
        label: "Back to sources",
      };
    case "match-reports":
      return {
        href: fromId ? `/match-reports/${fromId}` : "/search-requests",
        label: fromId ? "Back to match report" : "Back to search requests",
      };
    case "search-requests":
      return { href: "/search-requests", label: "Back to search requests" };
    case "browse":
      return { href: "/browse", label: "Back to Public preview" };
    default:
      return { href: "/listings", label: "Back to listings" };
  }
}

function resolveListingDetailCrumbs(context: ListingNavContext): BreadcrumbCrumb[] {
  const from = context.from?.trim() || null;
  const fromId = context.fromId?.trim() || null;
  const crumbs: BreadcrumbCrumb[] = [{ label: "Overview", href: "/" }];

  if (from && LISTING_FROM_CONTEXTS[from]) {
    const ctx = LISTING_FROM_CONTEXTS[from];
    if (ctx.prototypes) {
      crumbs.push({ label: "Prototypes", href: "/prototypes" });
    }

    if (from === "match-reports") {
      crumbs.push({ label: "Search requests", href: "/search-requests" });
      crumbs.push({
        label: "Match report",
        href: fromId ? `/match-reports/${fromId}` : null,
      });
    } else if (from === "sources" && fromId) {
      crumbs.push({ label: "Sources", href: "/sources" });
      crumbs.push({
        label: humanizeSegment(fromId),
        href: `/sources/${encodeURIComponent(fromId)}`,
      });
    } else {
      crumbs.push({ label: ctx.label, href: ctx.href });
    }

    crumbs.push({ label: "Listing", href: null });
    return crumbs;
  }

  crumbs.push({ label: "Listings", href: "/listings" });
  crumbs.push({ label: "Listing", href: null });
  return crumbs;
}

/**
 * Path-based breadcrumbs for the Labs shell header.
 * Listing detail pages may include `?from=` / `?fromId=` for contextual parents.
 */
export function resolveCrumbs(
  pathname: string,
  searchParams?: Pick<URLSearchParams, "get"> | null,
): BreadcrumbCrumb[] {
  if (pathname === "/") {
    return [{ label: "Overview", href: null }];
  }

  if (/^\/listings\/[^/]+$/.test(pathname)) {
    return resolveListingDetailCrumbs({
      from: searchParams?.get("from"),
      fromId: searchParams?.get("fromId"),
    });
  }

  // No index page at /match-reports — parent is Search requests.
  if (/^\/match-reports\/[^/]+$/.test(pathname)) {
    return [
      { label: "Overview", href: "/" },
      { label: "Prototypes", href: "/prototypes" },
      { label: "Search requests", href: "/search-requests" },
      { label: "Match report", href: null },
    ];
  }

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: BreadcrumbCrumb[] = [{ label: "Overview", href: "/" }];

  if (isPrototypePath(pathname)) {
    crumbs.push({ label: "Prototypes", href: "/prototypes" });
  }

  let path = "";
  for (const [index, segment] of segments.entries()) {
    path += `/${segment}`;
    const isLast = index === segments.length - 1;
    const parentPath = index === 0 ? "" : `/${segments.slice(0, index).join("/")}`;
    const known = ROUTE_LABELS[path];

    crumbs.push({
      label: known ?? dynamicSegmentLabel(parentPath, segment),
      href: isLast ? null : path,
    });
  }

  return crumbs;
}
