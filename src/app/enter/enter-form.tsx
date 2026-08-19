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
    <form action={formAction} className="space-y-5" aria-busy={pending}>
      <input type="hidden" name="next" value={nextPath} />
      <div className="space-y-2">
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
            className="h-11 pr-12 text-base md:text-sm"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? errorId : undefined}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-0.5 size-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-controls="demo-password"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </Button>
        </div>
        {state.error ? (
          <p
            id={errorId}
            role="alert"
            className="text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full text-sm font-semibold"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Checking…
          </>
        ) : (
          "Continue"
        )}
      </Button>
    </form>
  );
}
