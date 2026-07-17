"use client";

import { useState } from "react";
import { Loader2, LogIn, LogOut } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * One-time Labs admin unlock. Secret is POSTed to the server and never stored
 * in React state beyond this form submit, sessionStorage, or localStorage.
 */
export function LabsAdminLogin({
  hasSession,
  returnTo,
}: {
  hasSession: boolean;
  returnTo?: string;
}) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(hasSession);

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-labs-admin-secret": secret,
        },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Login failed");
      }
      setSecret("");
      setOk(true);
      window.location.assign(
        returnTo && returnTo.startsWith("/") ? returnTo : window.location.href,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    await fetch("/api/admin/login", { method: "DELETE" });
    setOk(false);
    setBusy(false);
    window.location.reload();
  }

  if (ok) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
          You are signed in as Labs admin. The session ends after 12 hours.
        </span>
        <Button variant="outline" size="sm" onClick={logout} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">Labs admin unlock</p>
        <p className="text-sm text-muted-foreground">
          Enter the shared Labs admin secret to open the internal dashboard.
          This is separate from production Merkado logins.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="labs-admin-secret">Admin secret</Label>
        <Input
          id="labs-admin-secret"
          type="password"
          autoComplete="off"
          placeholder="Paste the Labs admin secret"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && secret.trim() && !busy) void login();
          }}
        />
      </div>
      <Button onClick={login} disabled={busy || !secret.trim()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
        Unlock Labs admin
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to unlock</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
