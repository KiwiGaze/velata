import { cn } from "@velata/ui/lib/utils";
import { type ComponentProps, type ReactElement } from "react";

export function Badge({ className, ...props }: ComponentProps<"span">): ReactElement {
  return (
    <span
      data-slot="badge"
      className={cn(
        "bg-raise-2 text-ink-2 inline-flex items-center rounded-[5px] px-1.5 py-0.5 font-mono text-[9.5px] uppercase leading-none tracking-[0.04em]",
        className,
      )}
      {...props}
    />
  );
}
