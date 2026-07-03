import { cn } from "@velata/ui/lib/utils";
import { type ComponentProps, type ReactElement } from "react";

export function Kbd({ className, ...props }: ComponentProps<"kbd">): ReactElement {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "bg-raise border-line text-ink-2 pointer-events-none inline-flex select-none items-center rounded-[6px] border px-[7px] py-[3px] font-mono text-[11px] leading-none",
        className,
      )}
      {...props}
    />
  );
}
