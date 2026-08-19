"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { merkadoDirectHref, merkadoPayHref } from "@/lib/pay/config";

import { DirectIcon, PayIcon } from "./account-icons";

export const disabledSidebarRowClassName =
  "flex h-10 cursor-not-allowed items-center gap-[6px] rounded-[12px] px-[14px] text-[14px] font-semibold leading-[16px] text-grey-650";

export const liveSidebarRowClassName =
  "flex h-10 items-center justify-between gap-[6px] rounded-[12px] px-[14px] text-[14px] font-semibold leading-[16px] text-surface-dark transition-colors hover:bg-grey-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1";

export const disabledAccountMenuItemClassName =
  "flex h-10 cursor-not-allowed items-center gap-[10px] rounded-[10px] px-3 text-[13px] font-semibold leading-[16px] text-grey-650";

export const liveAccountMenuItemClassName =
  "flex h-10 items-center justify-between gap-[10px] rounded-[10px] px-3 text-[13px] font-semibold leading-[16px] text-surface-dark transition-colors hover:bg-grey-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1";

export const disabledMobileRowClassName =
  "flex h-[44px] w-full cursor-not-allowed items-center gap-[8px] px-[14px] text-left text-[15px] font-semibold leading-4 text-grey-650";

export const liveMobileRowClassName =
  "flex h-[44px] w-full items-center justify-between gap-[8px] rounded-[10px] px-[14px] text-left text-[15px] font-semibold leading-4 text-surface-dark transition-colors hover:bg-grey-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1";

export const disabledNavTextClassName =
  "inline-flex min-h-[44px] cursor-not-allowed items-center rounded text-[13px] font-semibold leading-4 text-grey-650";

export const disabledCreateListingClassName =
  "inline-flex h-9 cursor-not-allowed items-center justify-center rounded-[12px] bg-grey-200 px-3 text-[13px] font-semibold leading-4 text-grey-650";

export const disabledLogoutClassName =
  "flex h-10 cursor-not-allowed items-center gap-[10px] rounded-[10px] px-3 text-[13px] font-semibold leading-[16px] text-[#D93A39]/40";

export const disabledMobileLogoutClassName =
  "flex h-[44px] w-full cursor-not-allowed items-center gap-[8px] px-[14px] text-left text-[15px] font-semibold leading-4 text-[#D93A39]/40";

export function DisabledControl({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span aria-disabled="true" title="Not available in this demo" className={className}>
      {children}
    </span>
  );
}

function accountAppItems() {
  const pay = merkadoPayHref();
  const direct = merkadoDirectHref();
  return [
    { key: "pay", label: "Merkado Pay", icon: <PayIcon />, ...pay },
    { key: "direct", label: "Merkado Direct", icon: <DirectIcon />, ...direct },
  ] as const;
}

export function AccountAppLaunchLinks({
  className,
  iconGapClassName,
  onNavigate,
}: {
  className: string;
  iconGapClassName: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {accountAppItems().map((item) => (
        <Link
          key={item.key}
          href={item.href}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noreferrer" : undefined}
          onClick={onNavigate}
          className={className}
        >
          <span className={`flex min-w-0 items-center ${iconGapClassName}`}>
            {item.icon}
            <span className="truncate">{item.label}</span>
          </span>
          <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">
            {item.external ? "Opens in a new tab" : "Opens another Merkado app"}
          </span>
        </Link>
      ))}
    </>
  );
}
