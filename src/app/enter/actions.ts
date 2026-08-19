"use server";

import { redirect } from "next/navigation";

import {
  getDemoGateState,
  passwordsMatch,
  safeReturnPath,
} from "@/lib/demo-gate";
import { setDemoGateCookie } from "@/lib/demo-gate-server";

export type UnlockDemoState = {
  error?: string;
};

export async function unlockDemoAction(
  _previous: UnlockDemoState,
  formData: FormData,
): Promise<UnlockDemoState> {
  const state = getDemoGateState();
  if (!state.configured) {
    return { error: "This hosted demo is locked." };
  }

  const submitted = String(formData.get("password") ?? "");
  if (submitted.length > 200) {
    return { error: "That password is not correct." };
  }
  if (!passwordsMatch(submitted, state.password)) {
    return { error: "That password is not correct." };
  }

  await setDemoGateCookie(state.password);
  redirect(safeReturnPath(String(formData.get("next") ?? "")));
}
