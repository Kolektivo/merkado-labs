"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { unlockDemoAction, type UnlockDemoState } from "./actions";

const initialState: UnlockDemoState = {};

export function EnterForm({
  nextPath,
  configured,
}: {
  nextPath: string;
  configured: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    unlockDemoAction,
    initialState,
  );

  if (!configured) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        This private walkthrough is locked until the host sets the shared
        password.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />
      <div className="space-y-2">
        <Label htmlFor="demo-password">Shared password</Label>
        <Input
          id="demo-password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "demo-password-error" : undefined}
        />
        {state.error ? (
          <p id="demo-password-error" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
