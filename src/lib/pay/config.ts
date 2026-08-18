import type { CryptoConfig } from "@/lib/rent-advance/types";

export function networkDisplayLabel(config?: CryptoConfig | null): string {
  return config?.networkLabel?.trim() || "Network to be confirmed";
}

export function appHref(configured: string | undefined, fallback: string): {
  href: string;
  external: boolean;
} {
  const value = configured?.trim() ?? "";
  if (/^https:\/\//i.test(value)) {
    return { href: value, external: true };
  }
  return { href: fallback, external: false };
}

export function merkadoPayHref(): { href: string; external: boolean } {
  return appHref(process.env.NEXT_PUBLIC_MERKADO_PAY_URL, "/pay");
}

export function merkadoDirectHref(): { href: string; external: boolean } {
  return appHref(process.env.NEXT_PUBLIC_MERKADO_DIRECT_URL, "/originate");
}
