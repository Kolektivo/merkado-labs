"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { AuthProfile } from "@/lib/auth/profile";
import { signOutAction } from "@/lib/auth/sign-out";
import { MerkadoLogo } from "@/components/merkado/merkado-logo";
import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";

import {
  AccountAppLaunchLinks,
  DisabledControl,
  disabledAccountMenuItemClassName,
  disabledCreateListingClassName,
  disabledMobileRowClassName,
  disabledNavTextClassName,
  liveAccountMenuItemClassName,
  liveMobileRowClassName,
} from "./account-app-links";
import {
  AccountSettingsIcon,
  ChevronIcon,
  LogoutIcon,
  MyFavoritesIcon,
  MyListingsIcon,
  PlanBillingIcon,
} from "./account-icons";

const accountMenuSectionLabelClassName =
  "px-3 pb-1 pt-2 text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-grey-700";
const mobileSectionLabelClassName =
  "px-[14px] pb-1 pt-4 text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-grey-700";

function BrowseCarsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g transform="translate(10 10) scale(1.25) translate(-10 -10)">
        <path d="M4.16602 14.1667C4.16602 14.6087 4.34161 15.0326 4.65417 15.3452C4.96673 15.6577 5.39065 15.8333 5.83268 15.8333C6.27471 15.8333 6.69863 15.6577 7.01119 15.3452C7.32375 15.0326 7.49935 14.6087 7.49935 14.1667C7.49935 13.7246 7.32375 13.3007 7.01119 12.9882C6.69863 12.6756 6.27471 12.5 5.83268 12.5C5.39065 12.5 4.96673 12.6756 4.65417 12.9882C4.34161 13.3007 4.16602 13.7246 4.16602 14.1667Z" />
        <path d="M12.5 14.1667C12.5 14.6087 12.6756 15.0326 12.9882 15.3452C13.3007 15.6577 13.7246 15.8333 14.1667 15.8333C14.6087 15.8333 15.0326 15.6577 15.3452 15.3452C15.6577 15.0326 15.8333 14.6087 15.8333 14.1667C15.8333 13.7246 15.6577 13.3007 15.3452 12.9882C15.0326 12.6756 14.6087 12.5 14.1667 12.5C13.7246 12.5 13.3007 12.6756 12.9882 12.9882C12.6756 13.3007 12.5 13.7246 12.5 14.1667Z" />
        <path d="M4.16667 14.1667H2.5V9.16667M2.5 9.16667L4.16667 5H11.6667L15 9.16667M2.5 9.16667H15M15 9.16667H15.8333C16.2754 9.16667 16.6993 9.34226 17.0118 9.65482C17.3244 9.96738 17.5 10.3913 17.5 10.8333V14.1667H15.8333M12.5 14.1667H7.5M10 9.16667V5" />
      </g>
    </svg>
  );
}

function BrowseRealEstateIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function CreateListingIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden
    >
      <path
        d="M2.40039 10.1466V12.6171C2.40039 12.9916 2.54789 13.3507 2.81044 13.6154C3.07299 13.8802 3.42909 14.0289 3.80039 14.0289H12.2004C12.5717 14.0289 12.9278 13.8802 13.1903 13.6154C13.4529 13.3507 13.6004 12.9916 13.6004 12.6171V10.1466M8.0293 9.9711L8.0293 1.9711M8.0293 1.9711L4.8293 5.02787M8.0293 1.9711L11.2293 5.02787"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="block size-5 shrink-0 text-grey-900"
      aria-hidden
    >
      <path
        d="M16.6673 3.33334L3.33398 16.6667M16.6673 16.6667L3.33399 3.33334"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AccountNavbar({ profile }: { profile: AuthProfile }) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();
  const wallet = useMerkadoWallet();

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      wallet.disconnect();
      await signOutAction();
    } catch {
      setSigningOut(false);
      return;
    }
    router.push("/enter");
    router.refresh();
  }

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
        accountMenuButtonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileNavOpen]);

  return (
    <>
      <header className="mb-4 w-full border-b border-grey-200 bg-surface pt-[env(safe-area-inset-top)]">
        <nav
          className="mx-auto flex min-h-[56px] w-full max-w-[1030px] items-center gap-5 px-4 md:min-h-[60px]"
          aria-label="Main navigation"
        >
          <Link
            href="/"
            className="flex shrink-0 items-center rounded transition-opacity hover:opacity-90"
            aria-label="Merkado home"
          >
            <MerkadoLogo />
          </Link>

          <div className="hidden flex-1 items-center gap-5 md:flex">
            <DisabledControl className={disabledNavTextClassName}>Cars</DisabledControl>
            <DisabledControl className={disabledNavTextClassName}>Real Estate</DisabledControl>
          </div>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <div className="relative" ref={accountMenuRef}>
              <button
                ref={accountMenuButtonRef}
                type="button"
                onClick={() => setIsAccountMenuOpen((open) => !open)}
                className="inline-flex h-9 cursor-pointer items-center gap-1 px-2 text-[13px] font-semibold leading-4 text-violet-500 transition-colors hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1"
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
                aria-controls="account-menu"
              >
                <span>My account</span>
                <ChevronIcon isOpen={isAccountMenuOpen} />
              </button>
              {isAccountMenuOpen ? (
                <div
                  id="account-menu"
                  role="menu"
                  className="absolute top-full right-0 z-50 mt-1 max-h-[calc(100vh-5rem)] w-[220px] overflow-y-auto rounded-[12px] border border-grey-200 bg-surface p-1 shadow-[0_24px_80px_rgba(0,0,0,0.12)]"
                >
                  {profile.email || profile.name ? (
                    <div className="border-b border-grey-100 px-3 py-2">
                      <p className="truncate text-[13px] font-semibold leading-4 text-surface-dark">
                        {profile.name ?? "Signed in"}
                      </p>
                      {profile.email ? (
                        <p className="mt-0.5 truncate text-xs leading-4 text-grey-650">
                          {profile.email}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <p className={`${accountMenuSectionLabelClassName} pt-1`}>Marketplace</p>
                  <DisabledControl className={disabledAccountMenuItemClassName}>
                    <MyListingsIcon />
                    My Listings
                  </DisabledControl>
                  <DisabledControl className={disabledAccountMenuItemClassName}>
                    <MyFavoritesIcon />
                    My Favorites
                  </DisabledControl>
                  <p className={accountMenuSectionLabelClassName}>Apps</p>
                  <AccountAppLaunchLinks
                    className={liveAccountMenuItemClassName}
                    iconGapClassName="gap-[10px]"
                    onNavigate={() => setIsAccountMenuOpen(false)}
                  />
                  <p className={accountMenuSectionLabelClassName}>Account</p>
                  <DisabledControl className={disabledAccountMenuItemClassName}>
                    <PlanBillingIcon />
                    Plan & Billing
                  </DisabledControl>
                  <DisabledControl className={disabledAccountMenuItemClassName}>
                    <AccountSettingsIcon />
                    Account Settings
                  </DisabledControl>
                  <button
                    type="button"
                    disabled={signingOut}
                    onClick={() => void handleSignOut()}
                    className="flex h-10 w-full cursor-pointer items-center gap-[10px] rounded-[10px] px-3 text-left text-[13px] font-semibold leading-[16px] text-[#D93A39] transition-colors hover:bg-[#D93A39]/5 disabled:cursor-wait disabled:opacity-60"
                  >
                    <LogoutIcon />
                    {signingOut ? "Signing out…" : "Log out"}
                  </button>
                </div>
              ) : null}
            </div>
            <DisabledControl className={disabledCreateListingClassName}>
              Create a listing
            </DisabledControl>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            className="-mr-[2px] ml-auto flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] transition-colors hover:bg-black/[0.04] md:hidden"
            aria-label="Open navigation menu"
            aria-haspopup="dialog"
            aria-expanded={isMobileNavOpen}
            aria-controls="mobile-navigation-drawer"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M16.6673 15H3.33398M16.6673 10H3.33398M16.6673 5H3.33398" stroke="#141414" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </nav>
      </header>

      {isMobileNavOpen ? (
        <div className="fixed inset-0 z-[100] overflow-hidden md:hidden">
          <button
            type="button"
            className="absolute inset-0 cursor-pointer bg-black/60 backdrop-blur-[6px]"
            aria-label="Close navigation menu"
            onClick={() => setIsMobileNavOpen(false)}
          />
          <div
            id="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="relative ml-auto flex h-dvh w-full flex-col bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.2)] sm:w-[360px]"
          >
            <div className="flex items-center justify-end px-4 py-4">
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                className="relative -m-2 inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full p-2.5 text-grey-700 transition-colors hover:bg-grey-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1"
                aria-label="Close navigation menu"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <div className="flex min-h-full flex-col">
                <div>
                  <DisabledControl className={disabledMobileRowClassName}>
                    <CreateListingIcon />
                    <span>Create a listing</span>
                  </DisabledControl>

                  <p className={mobileSectionLabelClassName}>Browse</p>
                  <DisabledControl className={disabledMobileRowClassName}>
                    <BrowseCarsIcon />
                    <span>Cars</span>
                  </DisabledControl>
                  <DisabledControl className={disabledMobileRowClassName}>
                    <BrowseRealEstateIcon />
                    <span>Real Estate</span>
                  </DisabledControl>

                  <div className="mt-3 border-t border-grey-100">
                    <p className={mobileSectionLabelClassName}>Marketplace</p>
                    <DisabledControl className={disabledMobileRowClassName}>
                      <MyListingsIcon />
                      <span>My Listings</span>
                    </DisabledControl>
                    <DisabledControl className={disabledMobileRowClassName}>
                      <MyFavoritesIcon />
                      <span>My Favorites</span>
                    </DisabledControl>
                  </div>

                  <div className="mt-3 border-t border-grey-100">
                    <p className={mobileSectionLabelClassName}>Apps</p>
                    <AccountAppLaunchLinks
                      className={liveMobileRowClassName}
                      iconGapClassName="gap-[8px]"
                      onNavigate={() => setIsMobileNavOpen(false)}
                    />
                  </div>

                  <div className="mt-3 border-t border-grey-100">
                    <p className={mobileSectionLabelClassName}>Account</p>
                    <DisabledControl className={disabledMobileRowClassName}>
                      <PlanBillingIcon />
                      <span>Plan & Billing</span>
                    </DisabledControl>
                    <DisabledControl className={disabledMobileRowClassName}>
                      <AccountSettingsIcon />
                      <span>Account Settings</span>
                    </DisabledControl>
                  </div>
                </div>

                <div className="mt-auto">
                  <button
                    type="button"
                    disabled={signingOut}
                    onClick={() => void handleSignOut()}
                    className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[10px] px-[14px] text-left text-[15px] font-semibold leading-4 text-[#D93A39] transition-colors hover:bg-[#D93A39]/5 disabled:cursor-wait disabled:opacity-60"
                  >
                    <LogoutIcon />
                    {signingOut ? "Signing out…" : "Log out"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
