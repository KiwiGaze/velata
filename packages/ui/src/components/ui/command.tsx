import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@velata/ui/components/ui/dialog";
import { cn } from "@velata/ui/lib/utils";
import { Command as CommandPrimitive } from "cmdk";
import { type ComponentProps, type ReactElement } from "react";

export function Command({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive>): ReactElement {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn("bg-paper text-ink flex h-full w-full flex-col overflow-hidden", className)}
      {...props}
    />
  );
}

interface CommandDialogProps extends ComponentProps<typeof Dialog> {
  title?: string;
  description?: string;
}

export function CommandDialog({
  title = "Command palette",
  description = "Search and run a command",
  children,
  ...props
}: CommandDialogProps): ReactElement {
  return (
    <Dialog {...props}>
      <DialogContent className="p-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input>): ReactElement {
  return (
    <div data-slot="command-input-wrapper" className="border-line flex items-center border-b px-4">
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "text-ink placeholder:text-ink-3 flex h-11 w-full bg-transparent text-[13px] outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.List>): ReactElement {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("max-h-[320px] overflow-y-auto overflow-x-hidden p-1.5", className)}
      {...props}
    />
  );
}

export function CommandEmpty({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Empty>): ReactElement {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("text-ink-3 py-6 text-center text-[13px]", className)}
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Group>): ReactElement {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-ink [&_[cmdk-group-heading]]:text-ink-3 overflow-hidden [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export function CommandSeparator({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Separator>): ReactElement {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-line -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

export function CommandItem({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Item>): ReactElement {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "text-ink data-[selected=true]:bg-raise relative flex cursor-default select-none items-center gap-2 rounded-[9px] px-2.5 py-2 text-[13px] outline-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ className, ...props }: ComponentProps<"span">): ReactElement {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("text-ink-3 ml-auto font-mono text-[11px] tracking-wide", className)}
      {...props}
    />
  );
}
