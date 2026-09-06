"use client";

import { useActionState, useId, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/browser-client";

import { unlockDemoAction, type UnlockDemoState } from "./actions";

const ENTER_ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "We couldn't complete that sign in. Please try again.",
  auth_config: "Labs sign-in is not configured correctly yet. Check the Supabase publishable key.",
  sign_in_cancelled: "Sign in was cancelled. Please try again.",
  sign_in_incomplete: "We couldn't finish signing you in. Please try again.",
  verification_link_invalid:
    "That verification link is invalid or has expired. Request a new one.",
};

function buildCallbackUrl(nextPath: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  if (nextPath && nextPath !== "/") {
    url.searchParams.set("next", nextPath);
  }
  return url.toString();
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M21.35 12.27c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.26Z"
      />
      <path
        fill="#34A853"
        d="M12 21.7c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.29v2.53A9.74 9.74 0 0 0 12 21.7Z"
      />
      <path
        fill="#FBBC05"
        d="M6.53 13.78a5.85 5.85 0 0 1 0-3.56V7.69H3.29a9.74 9.74 0 0 0 0 8.62l3.24-2.53Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.19c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.28 14.63 2.3 12 2.3a9.74 9.74 0 0 0-8.71 5.39l3.24 2.53C7.3 7.91 9.46 6.19 12 6.19Z"
      />
    </svg>
  );
}

function LegacyPasswordForm({ nextPath }: { nextPath: string }) {
  const initialState: UnlockDemoState = {};
  const [state, formAction, pending] = useActionState(
    unlockDemoAction,
    initialState,
  );
  const [visible, setVisible] = useState(false);
  const errorId = useId();

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      aria-busy={pending}
    >
      <input type="hidden" name="next" value={nextPath} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="demo-password">Shared password</Label>
        <div className="relative">
          <Input
            id="demo-password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
            className="pr-9"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? errorId : undefined}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
            aria-controls="demo-password"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </Button>
        </div>
        {state.error ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Checking…
          </>
        ) : (
          "Continue with password"
        )}
      </Button>
    </form>
  );
}

export function EnterForm({
  nextPath,
  authAvailable,
  legacyPasswordAvailable,
  initialError,
  initialEmail,
}: {
  nextPath: string;
  authAvailable: boolean;
  legacyPasswordAvailable: boolean;
  initialError: string | null;
  initialEmail: string | null;
}) {
  const [email, setEmail] = useState(initialEmail?.trim() ?? "");
  const [error, setError] = useState(
    initialError ? (ENTER_ERROR_MESSAGES[initialError] ?? "") : "",
  );
  const [linkSent, setLinkSent] = useState(false);
  const [pending, setPending] = useState<"" | "google" | "otp">("");
  const [showPassword, setShowPassword] = useState(false);
  const errorId = useId();

  const isBusy = pending !== "";

  const handleGoogleSignIn = async () => {
    setError("");
    setPending("google");
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildCallbackUrl(nextPath),
        },
      });

      if (signInError) {
        setError("Google sign-in is not available yet. Please use email instead.");
        setPending("");
      }
    } catch {
      setError("Google sign-in is not available yet. Please use email instead.");
      setPending("");
    }
  };

  const handleMagicLinkSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    setError("");
    setLinkSent(false);
    setPending("otp");
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: buildCallbackUrl(nextPath),
        },
      });

      if (signInError) {
        setError("We couldn't send that sign-in link. Please try again.");
        setPending("");
        return;
      }

      setLinkSent(true);
      setPending("");
    } catch {
      setError("We couldn't send that sign-in link. Please try again.");
      setPending("");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {authAvailable ? (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            className="w-full"
            onClick={() => void handleGoogleSignIn()}
          >
            {pending === "google" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <form
            onSubmit={(event) => void handleMagicLinkSubmit(event)}
            className="flex flex-col gap-4"
            aria-busy={pending === "otp"}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="enter-email">Email</Label>
              <Input
                id="enter-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
            </div>
            {error ? (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {linkSent ? (
              <p role="status" className="text-sm text-muted-foreground">
                Check your email for the sign-in link.
              </p>
            ) : null}
            <Button type="submit" disabled={isBusy} className="w-full">
              {pending === "otp" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Sending…
                </>
              ) : (
                "Email me a sign-in link"
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">
            Not a Merkado account · not live on merkado.cw
          </p>

          {legacyPasswordAvailable ? (
            <div className="flex flex-col gap-3 border-t pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                aria-expanded={showPassword}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? "Hide host password" : "Use host password"}
              </Button>
              {showPassword ? <LegacyPasswordForm nextPath={nextPath} /> : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <LegacyPasswordForm nextPath={nextPath} />
          <p className="text-xs text-muted-foreground">
            Not a Merkado account · not live on merkado.cw
          </p>
        </>
      )}
    </div>
  );
}
