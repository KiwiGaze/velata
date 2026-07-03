import { cn, Kbd } from "@velata/ui";
import { type ReactElement } from "react";

/** A single footer hint: a key cap and its action label. */
export interface Hint {
  keyLabel: string;
  label: string;
  /** Extra classes on the hint wrapper, e.g. container-query visibility. */
  className?: string;
}

export function FooterHints({ hints }: { hints: readonly Hint[] }): ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-[18px]">
      {hints.map((hint) => (
        <div
          key={hint.keyLabel}
          className={cn("flex items-center gap-2 whitespace-nowrap", hint.className)}
        >
          <Kbd>{hint.keyLabel}</Kbd>
          <span className="text-ink-2 text-[12px]">{hint.label}</span>
        </div>
      ))}
    </div>
  );
}
