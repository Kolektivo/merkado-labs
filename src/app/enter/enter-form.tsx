"use client";

import { useActionState, useId, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { unlockDemoAction, type UnlockDemoState } from "./actions";

const initialState: UnlockDemoState = {};

export function EnterForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(
    unlockDemoAction,
    initialState,
  );
  const [visible, setVisible] = useState(false);
  const errorId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-busy={pending}>
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
          "Continue"
        )}
      </Button>
      <p className="text-xs text-muted-foreground">
        Not a Merkado account · not live on merkado.cw
      </p>
    </form>
  );
}
