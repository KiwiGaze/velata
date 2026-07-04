import { Button, cn } from "@velata/ui";
import { type KeyboardEvent, type ReactElement, useMemo } from "react";

import { MarkdownView } from "@/components/markdown-view";
import { type PreviewPhase } from "@/lib/live-preview-scheduler";
import { parseFormattedMarkdown } from "@/lib/markdown-format";

/** The split-mode transform applied to the live preview. */
export type PreviewMode = "clean" | "structure";

interface PreviewPaneProps {
  text: string;
  mode: PreviewMode;
  phase: PreviewPhase;
  errorMessage?: string;
  onModeChange: (mode: PreviewMode) => void;
}

const MODES: readonly { value: PreviewMode; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "structure", label: "Structure" },
];

function statusLabel(phase: PreviewPhase): string {
  switch (phase) {
    case "refreshing":
      return "refreshing…";
    case "ready":
      return "live";
    case "idle":
    case "error":
      return "";
  }
}

/** The read-only, live-updating refined preview shown as the right split pane. */
export function PreviewPane({
  text,
  mode,
  phase,
  errorMessage,
  onModeChange,
}: PreviewPaneProps): ReactElement {
  const formatted = useMemo(() => parseFormattedMarkdown(text), [text]);
  const showsResult = text.length > 0 && phase !== "error" && phase !== "idle";

  function handleRadioKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    onModeChange(mode === "clean" ? "structure" : "clean");
  }

  return (
    <div className="border-line-2 flex min-w-0 flex-1 flex-col border-l">
      <div className="flex h-10 flex-none items-center justify-between px-5">
        <div
          role="radiogroup"
          aria-label="Preview transform"
          onKeyDown={handleRadioKeyDown}
          className="flex items-center gap-0.5"
        >
          {MODES.map((entry) => (
            <Button
              key={entry.value}
              type="button"
              variant="ghost"
              role="radio"
              aria-checked={mode === entry.value}
              tabIndex={mode === entry.value ? 0 : -1}
              onClick={() => {
                onModeChange(entry.value);
              }}
              className={cn(
                "h-auto rounded-[7px] border-0 bg-transparent px-2 py-[5px] font-mono text-[11px] transition-colors",
                mode === entry.value ? "bg-raise text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <span aria-live="polite" className="text-ink-3 font-mono text-[11px]">
          {statusLabel(phase)}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-4 pt-4">
        {phase === "error" ? (
          <p className="text-ink-2 truncate font-mono text-[12px]">
            {errorMessage ?? "Refine failed"}
          </p>
        ) : showsResult ? (
          <div className="text-ink min-h-full text-[18px] leading-[1.72] tracking-[-0.003em] whitespace-pre-wrap">
            <MarkdownView document={formatted} />
          </div>
        ) : (
          <p className="text-ink-3 text-[13px]">
            {mode === "clean" ? "Clean preview" : "Structure preview"} appears here after you pause
            typing.
          </p>
        )}
      </div>
    </div>
  );
}
