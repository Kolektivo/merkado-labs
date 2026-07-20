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
import { ChevronLeft, ChevronRight, Building2, X } from "lucide-react";

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

function uniqueImages(images: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of images) {
    const url = raw?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function ListingImageGallery({
  images,
  altBase,
  variant = "card",
  className,
  priority = false,
  aspectClassName,
}: ListingImageGalleryProps) {
  const gallery = uniqueImages(images);
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
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
    (variant === "card" ? "relative aspect-[4/3] bg-muted" : "relative h-72 bg-muted");

  if (!current) {
    return (
      <div className={cn(shellClass, "flex items-center justify-center", className)}>
        <Building2 className="size-8 text-muted-foreground" aria-hidden />
        <span className="sr-only">No property image available</span>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(shellClass, "group overflow-hidden", className)}
        role="group"
        aria-roledescription="carousel"
        aria-labelledby={labelId}
        tabIndex={multi ? 0 : undefined}
        onKeyDown={onKeyNav}
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
            className="object-cover"
            sizes={
              variant === "card"
                ? "(max-width: 1280px) 50vw, 33vw"
                : "(max-width: 768px) 100vw, 896px"
            }
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            unoptimized
          />
        </button>

        {multi ? (
          <>
            <button
              type="button"
              aria-label="Previous image"
              className="absolute left-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
              onClick={(event) => {
                stopCardNav(event);
                go(-1);
              }}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next image"
              className="absolute right-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
              onClick={(event) => {
                stopCardNav(event);
                go(1);
              }}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
            <div className="absolute bottom-2 right-2 z-10 rounded bg-background/85 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
              {index + 1}/{count}
            </div>
          </>
        ) : null}
      </div>

      {variant === "detail" && multi ? (
        <div className="flex gap-2 overflow-x-auto p-2">
          {gallery.map((url, thumbIndex) => (
            <button
              key={`${url}-${thumbIndex}`}
              type="button"
              className={cn(
                "relative h-16 w-24 shrink-0 overflow-hidden rounded border",
                thumbIndex === index
                  ? "border-foreground"
                  : "border-transparent opacity-80 hover:opacity-100",
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
                sizes="96px"
                loading="lazy"
                unoptimized
              />
            </button>
          ))}
        </div>
      ) : null}

      {lightboxOpen && current ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${altBase} gallery`}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-background/90 p-2"
            aria-label="Close gallery"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="size-5" />
          </button>
          {multi ? (
            <>
              <button
                type="button"
                className="absolute left-4 rounded-full bg-background/90 p-2"
                aria-label="Previous image"
                onClick={(event) => {
                  event.stopPropagation();
                  go(-1);
                }}
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                className="absolute right-16 rounded-full bg-background/90 p-2"
                aria-label="Next image"
                onClick={(event) => {
                  event.stopPropagation();
                  go(1);
                }}
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          ) : null}
          <div
            className="relative h-[min(80vh,720px)] w-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={current}
              alt={`${altBase} — photo ${index + 1} of ${count}`}
              fill
              className="object-contain"
              sizes="100vw"
              unoptimized
            />
          </div>
          <div className="absolute bottom-4 rounded bg-background/90 px-3 py-1 text-sm tabular-nums">
            {index + 1} / {count}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Resolve gallery URLs for cards/detail with primary fallback. */
export function resolveListingGalleryUrls(input: {
  imageUrls?: string[] | null;
  primaryImageUrl?: string | null;
}): string[] {
  const fromGallery = (input.imageUrls ?? []).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0,
  );
  if (fromGallery.length) return uniqueImages(fromGallery);
  if (input.primaryImageUrl?.trim()) return [input.primaryImageUrl.trim()];
  return [];
}
