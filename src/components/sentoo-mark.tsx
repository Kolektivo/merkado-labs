import Image from "next/image";

import { cn } from "@/lib/utils";

export function SentooMark({
  expanded = false,
  className,
}: {
  expanded?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block shrink-0 overflow-hidden bg-[#1a6d8c] shadow-sm transition-[width,height,border-radius,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        expanded ? "size-8 rounded-lg" : "size-6 rounded-md",
        className,
      )}
    >
      <Image
        src="/brands/sentoo-mark.png"
        alt=""
        fill
        sizes="32px"
        className="object-cover"
      />
    </span>
  );
}
