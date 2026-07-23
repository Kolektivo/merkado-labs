"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Expand,
  Images,
  X,
} from "lucide-react";

import { uniqueListingImages } from "@/lib/listing-gallery-urls";
import { cn } from "@/lib/utils";

export type ListingImageGalleryProps = {
  images: string[];
  altBase: string;
  /** browse-card | detail */
  variant?: "card" | "detail";
  className?: string;
  priority?: boolean;
  aspectClassName?: string;
};

export function ListingImageGallery({
  images,
  altBase,
  variant = "card",
  className,
  priority = false,
  aspectClassName,
}: ListingImageGalleryProps) {
  const gallery = uniqueListingImages(images);
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const labelId = useId();

  const count = gallery.length;
  const current = count ? gallery[Math.min(index, count - 1)]! : null;
  const multi = count > 1;

  const go = useCallback(
    (delta: number) => {
      if (!multi) return;
      setIndex((prev) => (prev + delta + count) % count);
    },
    [count, multi],
  );

  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [go, lightboxOpen]);

  const onKeyNav = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    }
  };

  const stopCardNav = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartX.current;
    const end = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (start == null || end == null || !multi) return;
    const delta = end - start;
    if (Math.abs(delta) < 40) return;
    go(delta > 0 ? -1 : 1);
  };

  const shellClass =
    aspectClassName ??
    (variant === "card"
      ? "relative aspect-[4/3] bg-muted"
      : "relative aspect-[4/3] bg-muted sm:aspect-[16/10]");

  if (!current) {
    return (
      <div className={cn("overflow-hidden", className)}>
        <div className={cn(shellClass, "flex items-center justify-center")}>
          <Building2 className="size-8 text-muted-foreground" aria-hidden />
          <span className="sr-only">No property image available</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn("group min-w-0 overflow-hidden", className)}
        role="group"
        aria-roledescription="carousel"
        aria-labelledby={labelId}
        tabIndex={multi ? 0 : undefined}
        onKeyDown={onKeyNav}
      >
        <div
          className={cn(shellClass, "isolate overflow-hidden")}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <span id={labelId} className="sr-only">
            {altBase} images
          </span>
          <button
            type="button"
            className="absolute inset-0 z-0"
            onClick={(event) => {
              if (variant === "detail") {
                event.preventDefault();
                setLightboxOpen(true);
              }
            }}
            aria-label={
              variant === "detail"
                ? `Open larger view of ${altBase}`
                : undefined
            }
            tabIndex={variant === "detail" ? 0 : -1}
            style={variant === "card" ? { pointerEvents: "none" } : undefined}
          >
            <Image
              src={current}
              alt={`${altBase} — photo ${index + 1} of ${count}`}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.01]"
              sizes={
                variant === "card"
                  ? "(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  : "(max-width: 768px) 100vw, (max-width: 1280px) 70vw, 720px"
              }
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              unoptimized
            />
          </button>

          {variant === "detail" ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between bg-gradient-to-b from-black/45 to-transparent p-3 text-white">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium tabular-nums backdrop-blur-sm">
                <Images className="size-3.5" aria-hidden />
                {index + 1} / {count}
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                <Expand className="size-3.5" aria-hidden />
                View large
              </div>
            </div>
          ) : null}

          {multi ? (
            <>
              <button
                type="button"
                aria-label="Previous image"
                className={cn(
                  "absolute left-3 top-1/2 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition",
                  variant === "detail"
                    ? "bg-black/50 text-white hover:bg-black/65"
                    : "bg-background/85 text-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100",
                )}
                onClick={(event) => {
                  stopCardNav(event);
                  go(-1);
                }}
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Next image"
                className={cn(
                  "absolute right-3 top-1/2 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition",
                  variant === "detail"
                    ? "bg-black/50 text-white hover:bg-black/65"
                    : "bg-background/85 text-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100",
                )}
                onClick={(event) => {
                  stopCardNav(event);
                  go(1);
                }}
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
              {variant === "card" ? (
                <div className="absolute bottom-2 right-2 z-10 rounded bg-background/85 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
                  {index + 1}/{count}
                </div>
              ) : null}
            </>
          ) : null}

          {variant === "detail" && multi ? (
            <div className="absolute inset-x-0 bottom-0 z-10 hidden bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 pb-3 pt-10 sm:block">
              <div
                className="flex gap-2 overflow-x-auto overscroll-x-contain"
                aria-label="Choose a photo"
              >
                {gallery.map((url, thumbIndex) => (
                  <button
                    key={`${url}-${thumbIndex}`}
                    type="button"
                    className={cn(
                      "relative h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 ring-offset-1 ring-offset-black/40 transition",
                      thumbIndex === index
                        ? "ring-white"
                        : "opacity-70 ring-transparent hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-white",
                    )}
                    aria-label={`Show photo ${thumbIndex + 1}`}
                    aria-current={thumbIndex === index}
                    onClick={() => setIndex(thumbIndex)}
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="80px"
                      loading="lazy"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {lightboxOpen && current ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${altBase} gallery`}
          onClick={() => setLightboxOpen(false)}
        >
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4 text-white">
            <div className="inline-flex items-center gap-2 text-sm font-medium tabular-nums">
              <Images className="size-4" aria-hidden />
              {index + 1} / {count}
            </div>
            <button
              type="button"
              className="rounded-full bg-white/15 p-2 text-white backdrop-blur-sm hover:bg-white/25"
              aria-label="Close gallery"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="size-5" />
            </button>
          </div>
          {multi ? (
            <>
              <button
                type="button"
                className="absolute left-3 z-20 rounded-full bg-white/15 p-2.5 text-white backdrop-blur-sm hover:bg-white/25 sm:left-6"
                aria-label="Previous image"
                onClick={(event) => {
                  event.stopPropagation();
                  go(-1);
                }}
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                className="absolute right-3 z-20 rounded-full bg-white/15 p-2.5 text-white backdrop-blur-sm hover:bg-white/25 sm:right-6"
                aria-label="Next image"
                onClick={(event) => {
                  event.stopPropagation();
                  go(1);
                }}
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          ) : null}
          <div
            className="relative h-[min(78vh,760px)] w-[min(90vw,1200px)]"
            onClick={(event) => event.stopPropagation()}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <Image
              src={current}
              alt={`${altBase} — photo ${index + 1} of ${count}`}
              fill
              className="object-contain"
              sizes="100vw"
              priority
              unoptimized
            />
          </div>
          {multi ? (
            <div className="absolute inset-x-0 bottom-0 z-20 hidden justify-center bg-gradient-to-t from-black/70 to-transparent px-6 pb-4 pt-10 sm:flex">
              <div className="flex max-w-full gap-2 overflow-x-auto">
                {gallery.map((url, thumbIndex) => (
                  <button
                    key={`lightbox-${url}-${thumbIndex}`}
                    type="button"
                    className={cn(
                      "relative h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 transition",
                      thumbIndex === index
                        ? "ring-white"
                        : "opacity-60 ring-transparent hover:opacity-100",
                    )}
                    aria-label={`Show photo ${thumbIndex + 1}`}
                    aria-current={thumbIndex === index}
                    onClick={(event) => {
                      event.stopPropagation();
                      setIndex(thumbIndex);
                    }}
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="80px"
                      loading="lazy"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
