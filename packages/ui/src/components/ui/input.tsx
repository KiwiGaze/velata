import { cn } from "@velata/ui/lib/utils";
import { type ComponentProps, type ReactElement } from "react";

export function Input({ className, type, ...props }: ComponentProps<"input">): ReactElement {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-line-2 bg-paper text-ink placeholder:text-ink-3 focus-visible:border-ink-3 h-9 w-full rounded-[9px] border px-3 text-[13px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
