import { type Instruction } from "@velata/core";
import {
  Button,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@velata/ui";
import { RefreshCw } from "lucide-react";
import { type ReactElement } from "react";

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
    <TooltipProvider>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
        <div
          role="toolbar"
          aria-label="Transforms"
          aria-orientation="horizontal"
          className="pointer-events-auto border-line bg-paper flex items-center gap-1 rounded-[11px] border px-1.5 py-1 shadow-[0_10px_28px_-14px_rgb(0_0_0/0.3),0_2px_8px_-4px_rgb(0_0_0/0.12)]"
        >
          {presets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                onRun(preset);
              }}
            >
              {preset.name}
            </Button>
          ))}
          <Separator orientation="vertical" className="mx-0.5 h-4" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="New batch"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  onShuffle();
                }}
                className="text-ink-2 hover:bg-raise hover:text-ink inline-flex size-7 items-center justify-center rounded-[7px] transition-colors"
              >
                <RefreshCw aria-hidden className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">New batch</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
