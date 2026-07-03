import { Separator, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@velata/ui";
import {
  Bold,
  Code,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  type LucideIcon,
  TextQuote,
} from "lucide-react";
import { Fragment, type ReactElement } from "react";

import { type FormatAction } from "@/lib/apply-format";

interface FormattingToolbarProps {
  onApply: (action: FormatAction) => void;
}

interface ToolbarButton {
  action: FormatAction;
  label: string;
  icon: LucideIcon;
}

interface ToolbarGroup {
  id: string;
  buttons: readonly ToolbarButton[];
}

const GROUPS: readonly ToolbarGroup[] = [
  {
    id: "inline",
    buttons: [
      { action: "bold", label: "Bold", icon: Bold },
      { action: "italic", label: "Italic", icon: Italic },
      { action: "code", label: "Code", icon: Code },
    ],
  },
  {
    id: "list",
    buttons: [
      { action: "bullet-list", label: "Bulleted list", icon: List },
      { action: "numbered-list", label: "Numbered list", icon: ListOrdered },
      { action: "check-list", label: "Checklist", icon: ListChecks },
    ],
  },
  {
    id: "block",
    buttons: [
      { action: "quote", label: "Quote", icon: TextQuote },
      { action: "link", label: "Link", icon: Link },
    ],
  },
];

/** A floating monochrome toolbar that rewrites the editor selection with Markdown formatting. */
export function FormattingToolbar({ onApply }: FormattingToolbarProps): ReactElement {
  return (
    <TooltipProvider>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
        <div
          role="toolbar"
          aria-label="Formatting"
          aria-orientation="horizontal"
          className="pointer-events-auto border-line bg-paper flex items-center gap-0.5 rounded-[11px] border px-1.5 py-1 shadow-[0_10px_28px_-14px_rgb(0_0_0/0.3),0_2px_8px_-4px_rgb(0_0_0/0.12)]"
        >
          {GROUPS.map((group, index) => (
            <Fragment key={group.id}>
              {index > 0 && <Separator orientation="vertical" className="mx-1 h-4" />}
              {group.buttons.map(({ action, label, icon: Icon }) => (
                <Tooltip key={action}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={label}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        onApply(action);
                      }}
                      className="text-ink-2 hover:bg-raise hover:text-ink inline-flex size-7 items-center justify-center rounded-[7px] transition-colors"
                    >
                      <Icon aria-hidden className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{label}</TooltipContent>
                </Tooltip>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
