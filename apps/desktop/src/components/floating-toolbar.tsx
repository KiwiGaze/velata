import { cn, Separator, TooltipProvider } from "@velata/ui";
import { type MouseEvent, type ReactElement, type ReactNode } from "react";

interface FloatingToolbarProps {
  ariaLabel: string;
  /** Tailwind gap utility between children; defaults to `gap-0.5`. */
  gapClassName?: string;
  /** Optional content rendered after the children, separated by a divider. */
  trailing?: ReactNode;
  children: ReactNode;
}

/** Bottom-center floating toolbar: pointer-events pass-through shell with a paper card. */
export function FloatingToolbar({
  ariaLabel,
  gapClassName = "gap-0.5",
  trailing,
  children,
}: FloatingToolbarProps): ReactElement {
  return (
    <TooltipProvider>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
        <div
          role="toolbar"
          aria-label={ariaLabel}
          aria-orientation="horizontal"
          className={cn(
            "pointer-events-auto border-line bg-paper flex items-center rounded-[11px] border px-1.5 py-1 shadow-[0_10px_28px_-14px_rgb(0_0_0/0.3),0_2px_8px_-4px_rgb(0_0_0/0.12)]",
            gapClassName,
          )}
        >
          {children}
          {trailing === undefined ? null : (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-4" />
              {trailing}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

/** Shared className for a compact icon Button inside a floating toolbar. */
export const TOOLBAR_ICON_BUTTON_CLASS =
  "text-ink-2 hover:bg-raise hover:text-ink inline-flex size-7 items-center justify-center rounded-[7px] border-0 bg-transparent p-0 transition-colors";

/** Shared `onMouseDown` that prevents the editor from losing selection on toolbar press. */
export function preventEditorBlur(event: MouseEvent): void {
  event.preventDefault();
}
