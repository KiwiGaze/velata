import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@velata/ui/lib/utils";
import { type ComponentProps, type ReactElement } from "react";

export function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>): ReactElement {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "bg-raise-2 data-[state=checked]:bg-ink inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block h-[18px] w-[18px] translate-x-[2px] rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]"
      />
    </SwitchPrimitive.Root>
  );
}
