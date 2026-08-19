"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { DEMO_RENTER_PROFILE } from "@/lib/demo-account-profile";

import {
  AccountAppLaunchLinks,
  DisabledControl,
  disabledSidebarRowClassName,
  liveSidebarRowClassName,
} from "./account-app-links";
import {
  AccountSettingsIcon,
  AppsIcon,
  ChevronIcon,
  MyFavoritesIcon,
  MyListingsIcon,
  PlanBillingIcon,
} from "./account-icons";

const sectionLabelClassName =
  "px-[14px] pb-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-grey-700";

type SidebarItem = {
  key: string;
  label: string;
  icon: ReactNode;
};

type SidebarGroup = {
  id: "marketplace" | "account" | "apps";
  label: string;
  items: SidebarItem[];
};

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "marketplace",
    label: "Marketplace",
    items: [
      { key: "listings", label: "My Listings", icon: <MyListingsIcon /> },
      { key: "favorites", label: "My Favorites", icon: <MyFavoritesIcon /> },
    ],
  },
  {
    id: "apps",
    label: "Apps",
    items: [],
  },
  {
    id: "account",
    label: "Account",
    items: [
      { key: "billing", label: "Plan & Billing", icon: <PlanBillingIcon /> },
      { key: "settings", label: "Account Settings", icon: <AccountSettingsIcon /> },
    ],
  },
];

function SidebarNavGroups({ onItemClick }: { onItemClick?: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {SIDEBAR_GROUPS.map((group, groupIndex) => {
        const labelId = `account-nav-${group.id}-label`;
        return (
          <div key={group.id} role="group" aria-labelledby={labelId} className="flex flex-col gap-0">
            <p
              id={labelId}
              className={`${sectionLabelClassName} ${groupIndex === 0 ? "pt-2" : "pt-1"}`}
            >
              {group.label}
            </p>
            {group.id === "apps" ? (
              <AccountAppLaunchLinks
                className={liveSidebarRowClassName}
                iconGapClassName="gap-[6px]"
                onNavigate={onItemClick}
              />
            ) : (
              group.items.map((item) => (
                <DisabledControl
                  key={item.key}
                  className={disabledSidebarRowClassName}
                >
                  {item.icon}
                  {item.label}
                </DisabledControl>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AccountSidebar() {
  const pathname = usePathname();
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const isMobileNavOpen = openForPath === pathname;
  const mobileNavRef = useRef<HTMLDivElement | null>(null);
  const mobileNavButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Node)) {
        return;
      }
      if (!mobileNavRef.current?.contains(eventTarget)) {
        setOpenForPath(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenForPath(null);
        mobileNavButtonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileNavOpen]);

  return (
    <aside className="rounded-[16px] border border-grey-200 bg-surface p-5 min-[769px]:p-6">
      <div className="flex items-center gap-2">
        <Image
          src={DEMO_RENTER_PROFILE.avatarSrc}
          alt={DEMO_RENTER_PROFILE.fullName}
          width={32}
          height={32}
          className="size-8 shrink-0 rounded-full object-cover"
        />
        <div className="flex min-w-0 flex-col gap-[2px]">
          <p className="text-[10px] font-medium leading-[10px] text-grey-700">
            {DEMO_RENTER_PROFILE.roleLabel}
          </p>
          <p className="truncate text-[14px] font-medium leading-5 text-surface-dark">
            {DEMO_RENTER_PROFILE.fullName}
          </p>
        </div>
      </div>

      <nav aria-label="Account navigation" className="mt-4 border-t border-grey-100 pt-4">
        <div ref={mobileNavRef} className="relative md:hidden">
          <button
            ref={mobileNavButtonRef}
            type="button"
            onClick={() =>
              setOpenForPath((current) => (current === pathname ? null : pathname))
            }
            aria-expanded={isMobileNavOpen}
            aria-controls="account-mobile-navigation"
            aria-label="Account pages, Merkado Pay and Merkado Direct"
            className="flex h-10 w-full cursor-pointer items-center justify-between gap-[6px] rounded-[12px] bg-grey-100 px-[14px] text-left text-[14px] font-semibold leading-[16px] text-surface-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1"
          >
            <span className="flex items-center gap-[6px]">
              <AppsIcon />
              Apps
            </span>
            <ChevronIcon isOpen={isMobileNavOpen} />
          </button>
          {isMobileNavOpen ? (
            <div
              id="account-mobile-navigation"
              className="absolute top-full right-0 left-0 z-40 mt-1 origin-top overflow-hidden rounded-[12px] border border-grey-200 bg-surface p-1 shadow-lg"
            >
              <SidebarNavGroups onItemClick={() => setOpenForPath(null)} />
            </div>
          ) : null}
        </div>

        <div className="hidden md:block">
          <SidebarNavGroups />
        </div>
      </nav>
    </aside>
  );
}
