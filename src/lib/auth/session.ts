import "server-only";

import { redirect } from "next/navigation";

import { passesAdminEmailGate } from "@/lib/auth/admin";
import { getOptionalUser } from "@/lib/supabase/server-client";

export type AuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
};

export { getOptionalUser };

export async function requireUser(): Promise<AuthUser> {
  const user = await getOptionalUser();
  if (!user) {
    redirect("/enter");
  }
  return {
    id: user.id,
    email: user.email ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    user_metadata: user.user_metadata ?? undefined,
  };
}

export async function requireAdminUser(): Promise<AuthUser> {
  const user = await requireUser();
  if (!passesAdminEmailGate(user.email)) {
    throw new Error("This account is not authorized for admin access.");
  }
  return user;
}