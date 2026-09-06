"use server";

import { createClient } from "@/lib/supabase/server-client";

/** Sign the current Supabase Auth session out. The client clears wallet UI state. */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
