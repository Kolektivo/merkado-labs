import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  cookieValueForPassword,
  DEMO_GATE_COOKIE,
  DEMO_GATE_PATH,
  getDemoGateState,
  isValidGateCookie,
} from "@/lib/demo-gate";
import { getCurrentWalletIdentity } from "@/lib/wallet/identity";

export async function isDemoUnlocked(): Promise<boolean> {
  const state = getDemoGateState();
  if (!state.active) return true;
  if (!state.configured) return false;
  const value = (await cookies()).get(DEMO_GATE_COOKIE)?.value;
  return isValidGateCookie(value, state.password);
}

export async function redirectIfDemoLocked(): Promise<void> {
  if (await isDemoUnlocked()) return;
  redirect(DEMO_GATE_PATH);
}

export async function redirectEnterIfNotNeeded(): Promise<void> {
  if ((await isDemoUnlocked()) && (await getCurrentWalletIdentity())) {
    redirect("/");
  }
}

export async function assertDemoUnlocked(): Promise<void> {
  if (await isDemoUnlocked()) return;
  throw new Error("Enter the shared password to continue.");
}

export async function setDemoGateCookie(password: string): Promise<void> {
  (await cookies()).set({
    name: DEMO_GATE_COOKIE,
    value: cookieValueForPassword(password),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.VERCEL === "1",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}
