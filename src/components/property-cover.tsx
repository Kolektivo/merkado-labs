import Image from "next/image";

import { cn } from "@/lib/utils";

function isInlineSrc(src: string) {
  return src.startsWith("data:") || src.startsWith("blob:");
}

export function PropertyCover({
  src,
  alt = "",
  className,
  sizes = "(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw",
}: {
  src: string;
  alt?: string;
  className?: string;
  sizes?: string;
}) {
  if (isInlineSrc(src)) {
    return (
      // Uploaded covers are stored on the demo book as data URLs.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className={cn("size-full object-cover", className)} />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={cn("object-cover", className)}
    />
  );
}
