import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cn } from "@velata/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { type ComponentProps, type ReactElement } from "react";

export function Accordion(props: ComponentProps<typeof AccordionPrimitive.Root>): ReactElement {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

export function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Item>): ReactElement {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-line-2 bg-paper mb-2 overflow-hidden rounded-[11px] border", className)}
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>): ReactElement {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "hover:bg-raise flex flex-1 items-center gap-3 px-3 py-3 text-left outline-none transition-colors [&[data-state=open]>svg]:rotate-180",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="text-ink-3 size-3.5 shrink-0 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Content>): ReactElement {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className={cn("border-line overflow-hidden border-t", className)}
      {...props}
    >
      <div className="px-[14px] pb-4 pt-2">{children}</div>
    </AccordionPrimitive.Content>
  );
}
