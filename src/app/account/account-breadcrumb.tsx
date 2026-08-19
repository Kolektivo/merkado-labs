"use client";

import Link from "next/link";

function BreadcrumbChevron() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="size-4 shrink-0 text-grey-700"
      aria-hidden
    >
      <path
        d="M6.66667 4.66667L10 8.00001L6.66667 11.3333"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AccountBreadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="relative mx-[2px] h-6 w-full min-w-0 max-w-full">
      <ol className="flex h-6 w-full min-w-0 max-w-full flex-nowrap items-center gap-1.5 text-[12px] font-medium leading-none text-grey-700">
        <li className="relative z-10 flex h-6 shrink-0 items-center">
          <Link
            href="/"
            className="relative inline-flex h-6 min-w-0 max-w-[7rem] items-center rounded text-grey-700 transition-colors duration-200 ease-out before:absolute before:-inset-x-2 before:-inset-y-1.5 before:content-[''] hover:text-grey-900 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none sm:max-w-[10rem]"
          >
            <span className="block min-w-0 max-w-full truncate leading-6">Home</span>
          </Link>
        </li>
        <li className="relative flex h-6 shrink-0 items-center gap-1.5">
          <BreadcrumbChevron />
          <span className="block h-6 min-w-0 max-w-[7rem] truncate leading-6 text-grey-700 sm:max-w-[10rem]">
            My Account
          </span>
        </li>
        <li className="flex h-6 min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <BreadcrumbChevron />
          <span
            className="block h-6 min-w-0 max-w-[12rem] truncate leading-6 text-grey-900 sm:max-w-[18rem]"
            aria-current="page"
          >
            Apps
          </span>
        </li>
      </ol>
    </nav>
  );
}
