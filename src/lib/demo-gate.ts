import { createHash, timingSafeEqual } from "node:crypto";

export const DEMO_GATE_COOKIE = "labs_demo_gate";
export const DEMO_GATE_PATH = "/enter";

export type DemoGateEnv = {
  LABS_DEMO_PASSWORD?: string;
  VERCEL_ENV?: string;
  [key: string]: string | undefined;
};

export type DemoGateState = {
  active: boolean;
  configured: boolean;
  password: string;
  hostedProduction: boolean;
};

export function getDemoGateState(env: DemoGateEnv = process.env): DemoGateState {
  const password = env.LABS_DEMO_PASSWORD?.trim() ?? "";
  const hostedProduction = env.VERCEL_ENV === "production";
  const configured = password.length > 0;
  return {
    active: configured || hostedProduction,
    configured,
    password,
    hostedProduction,
  };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(`merkado-labs-demo-gate:${value}`).digest();
}

export function passwordsMatch(submitted: string, expected: string): boolean {
  const left = digest(submitted);
  const right = digest(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function cookieValueForPassword(password: string): string {
  return digest(password).toString("hex");
}

export function isValidGateCookie(
  cookieValue: string | undefined,
  password: string,
): boolean {
  if (!cookieValue || !password) return false;
  const left = Buffer.from(cookieValue, "utf8");
  const right = Buffer.from(cookieValueForPassword(password), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function safeReturnPath(raw: string | null | undefined): string {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("://") ||
    raw.includes("\\")
  ) {
    return "/";
  }
  if (raw === DEMO_GATE_PATH || raw.startsWith(`${DEMO_GATE_PATH}/`)) {
    return "/";
  }
  return raw;
}

export function shouldAllowUngatedPath(pathname: string): boolean {
  return (
    pathname === DEMO_GATE_PATH ||
    pathname.startsWith(`${DEMO_GATE_PATH}/`) ||
    pathname.startsWith("/_next/") ||
    pathname === "/cw-logo.png" ||
    pathname === "/favicon.ico"
  );
}
