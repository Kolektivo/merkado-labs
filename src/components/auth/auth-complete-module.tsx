"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/browser-client";

type AuthCompleteModuleProps = {
  nextPath: string | null;
  email: string | null;
};

function getSessionTokensFromHash() {
  if (typeof window === "undefined" || !window.location.hash) {
    return null;
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}

export function AuthCompleteModule({ nextPath, email }: AuthCompleteModuleProps) {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you in…");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    const completeAuth = async () => {
      const destination = nextPath ?? "/";
      const tokens = getSessionTokensFromHash();

      try {
        const supabase = createClient();

        if (!tokens) {
          const {
            data: { user },
            error,
          } = await supabase.auth.getUser();

          if (!isActive) {
            return;
          }

          if (!error && user) {
            router.replace(destination);
            router.refresh();
            return;
          }
        } else {
          const {
            data: { session },
            error,
          } = await supabase.auth.setSession({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
          });

          if (!isActive) {
            return;
          }

          const url = new URL(window.location.href);
          url.hash = "";
          window.history.replaceState({}, "", url.toString());

          if (error || !session) {
            setErrorMessage(
              "We couldn't finish signing you in from that email link. Request a new link and try again.",
            );
            setMessage("");
            return;
          }

          router.replace(destination);
          router.refresh();
          return;
        }
      } catch {
        if (!isActive) {
          return;
        }
      }

      if (!isActive) {
        return;
      }

      setErrorMessage(
        "We couldn't finish signing you in. Request a new sign-in link and try again.",
      );
      setMessage("");
    };

    void completeAuth();

    return () => {
      isActive = false;
    };
  }, [nextPath, router]);

  const enterQuery = [
    nextPath && nextPath !== "/" ? `next=${encodeURIComponent(nextPath)}` : null,
    email ? `email=${encodeURIComponent(email)}` : null,
  ]
    .filter(Boolean)
    .join("&");
  const enterHref = `/enter${enterQuery ? `?${enterQuery}` : ""}`;

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <main id="main-content" className="w-full max-w-sm" tabIndex={-1}>
        <Card>
          <CardHeader>
            <CardTitle>Completing sign in</CardTitle>
            <CardDescription>Finishing your Merkado sign in.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            {errorMessage ? (
              <>
                <p role="alert" className="text-sm text-destructive">
                  {errorMessage}
                </p>
                <Button asChild variant="outline" className="w-full">
                  <a href={enterHref}>Back to sign in</a>
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}