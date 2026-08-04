import { Separator, Tooltip, TooltipContent, TooltipTrigger } from "@velata/ui";
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

import { type FormatAction } from "@/components/editor-extensions";
import {
  FloatingToolbar,
  preventEditorBlur,
  TOOLBAR_ICON_BUTTON_CLASS,
} from "@/components/floating-toolbar";

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
    <FloatingToolbar ariaLabel="Formatting">
      {GROUPS.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 && <Separator orientation="vertical" className="mx-1 h-4" />}
          {group.buttons.map(({ action, label, icon: Icon }) => (
            <Tooltip key={action}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={label}
                  onMouseDown={preventEditorBlur}
                  onClick={() => {
                    onApply(action);
                  }}
                  className={TOOLBAR_ICON_BUTTON_CLASS}
                >
                  <Icon aria-hidden className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{label}</TooltipContent>
            </Tooltip>
          ))}
        </Fragment>
      ))}
    </FloatingToolbar>
  );
}
