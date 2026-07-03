import { cn } from "@velata/ui";
import { type ReactElement } from "react";

/** Slim indeterminate refine indicator pinned to the top of the sheet. */
export function ProgressLine({ active }: { active: boolean }): ReactElement {
  return (
    <div
      aria-hidden
      className={cn(
        "bg-ink pointer-events-none absolute left-0 top-0 h-0.5 w-0 transition-opacity duration-200",
        active ? "animate-progress-slide opacity-[0.85]" : "opacity-0",
      )}
    />
  );
}
