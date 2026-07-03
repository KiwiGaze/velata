import { cn } from "@velata/ui";
import { type ReactElement, type ReactNode } from "react";

import {
  type FormattedMarkdown,
  type MarkdownLine,
  type MarkdownRun,
} from "@/lib/markdown-format";

function markerLabel(line: MarkdownLine): string | null {
  switch (line.kind) {
    case "bullet":
      return "•";
    case "numbered":
      return line.marker.trim();
    case "check":
      return /^- \[[xX]\] /.test(line.marker) ? "☑" : "□";
    case "quote":
    case "plain":
      return null;
  }
}

function renderRun(run: MarkdownRun, key: string): ReactNode {
  const mark = run.marks.join(" ");
  const className = cn(
    run.marks.includes("bold") && "font-semibold",
    run.marks.includes("italic") && "italic",
    run.marks.includes("code") && "bg-raise rounded-[4px] px-1 font-mono text-[0.92em]",
    run.marks.includes("link") && "underline decoration-1 underline-offset-[3px]",
  );

  if (mark.length === 0) {
    return <span key={key}>{run.text}</span>;
  }

  return (
    <span key={key} data-editor-mark={mark} data-editor-url={run.url} className={className}>
      {run.text}
    </span>
  );
}

function renderLine(line: MarkdownLine, index: number): ReactNode {
  const marker = markerLabel(line);
  return (
    <div
      key={`${line.sourceStart.toString()}-${index.toString()}`}
      data-editor-line="true"
      data-source-marker={line.marker}
      className={cn(
        "min-h-[1.72em] cursor-text",
        line.kind === "quote" && "border-line-2 border-l pl-4",
        line.kind !== "plain" && line.kind !== "quote" && "flex gap-3",
      )}
    >
      {marker === null ? null : (
        <span
          data-editor-marker="true"
          contentEditable={false}
          className="text-ink-3 mt-[0.05em] w-5 shrink-0 select-none text-right"
        >
          {marker}
        </span>
      )}
      <span data-editor-content="true" className="min-w-0 flex-1">
        {line.runs.length > 0 ? (
          line.runs.map((run, runIndex) =>
            renderRun(run, `${index.toString()}-${runIndex.toString()}`),
          )
        ) : (
          <br />
        )}
      </span>
    </div>
  );
}

/** Read-only rendered-Markdown lines shared by the editor and the preview pane. */
export function MarkdownView({ document }: { document: FormattedMarkdown }): ReactElement {
  return <>{document.lines.map(renderLine)}</>;
}
