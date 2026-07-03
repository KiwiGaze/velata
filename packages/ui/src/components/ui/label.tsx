import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@velata/ui/lib/utils";
import { type ComponentProps, type ReactElement } from "react";

export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>): ReactElement {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-ink flex select-none items-center gap-2 text-[13.5px] font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
