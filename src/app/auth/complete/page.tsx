import type { Metadata } from "next";

import { AuthCompleteModule } from "@/components/auth/auth-complete-module";
import { safeReturnPath } from "@/lib/demo-gate";

export const metadata: Metadata = {
  title: "Completing sign in",
  description: "Finishing your Merkado sign in.",
  robots: { index: false, follow: false },
};

type AuthCompletePageProps = {
  searchParams: Promise<{
    next?: string;
    redirect?: string;
    email?: string;
  }>;
};

export default async function AuthCompletePage({
  searchParams,
}: AuthCompletePageProps) {
  const params = await searchParams;
  const nextPath = safeReturnPath(params.next ?? params.redirect);
  const email = typeof params.email === "string" ? params.email : null;

  return <AuthCompleteModule nextPath={nextPath} email={email} />;
}