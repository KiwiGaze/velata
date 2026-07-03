import { cn } from "@velata/ui/lib/utils";
import { type ComponentProps, type ReactElement } from "react";

export function Textarea({ className, ...props }: ComponentProps<"textarea">): ReactElement {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "text-ink placeholder:text-ink-3 w-full bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
