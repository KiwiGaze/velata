import { type Instruction } from "@velata/core";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@velata/ui";
import { RefreshCw } from "lucide-react";
import { type ReactElement } from "react";

import {
  FloatingToolbar,
  preventEditorBlur,
  TOOLBAR_ICON_BUTTON_CLASS,
} from "@/components/floating-toolbar";

interface TransformBarProps {
  presets: readonly Instruction[];
  disabled: boolean;
  onRun: (instruction: Instruction) => void;
  onShuffle: () => void;
}

/** A floating bar of one-tap transform chips plus a "new batch" reshuffle. */
export function TransformBar({
  presets,
  disabled,
  onRun,
  onShuffle,
}: TransformBarProps): ReactElement {
  return (
    <FloatingToolbar
      ariaLabel="Transforms"
      gapClassName="gap-1"
      trailing={
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="New batch"
              onMouseDown={preventEditorBlur}
              onClick={() => {
                onShuffle();
              }}
              className={TOOLBAR_ICON_BUTTON_CLASS}
            >
              <RefreshCw aria-hidden className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">New batch</TooltipContent>
        </Tooltip>
      }
    >
      {presets.map((preset) => (
        <Button
          key={preset.id}
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onMouseDown={preventEditorBlur}
          onClick={() => {
            onRun(preset);
          }}
        >
          {preset.name}
        </Button>
      ))}
    </FloatingToolbar>
  );
}
