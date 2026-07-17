import { HelpTip } from "@/components/help-tip";
import { cn } from "@/lib/utils";

/** Visible field label with optional plain-language help tip. */
export function FieldLabel({
  children,
  tip,
  tipLabel,
  className,
  htmlFor,
}: {
  children: React.ReactNode;
  tip?: React.ReactNode;
  tipLabel?: string;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div
      className={cn(
        "mb-1.5 flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {htmlFor ? (
        <label htmlFor={htmlFor} className="truncate">
          {children}
        </label>
      ) : (
        <span className="truncate">{children}</span>
      )}
      {tip ? (
        <HelpTip label={tipLabel ?? String(children)} className="shrink-0">
          {tip}
        </HelpTip>
      ) : null}
    </div>
  );
}
