import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@velata/ui";
import { Trash2 } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";

import { type Draft } from "@/hooks/use-drafts";
import { type DraftMatch, firstNonEmptyLine, type HighlightRange } from "@/lib/draft-search";
import { formatRelativeTime } from "@/lib/relative-time";

interface DraftRowProps {
  draft: Draft;
  active: boolean;
  now: number;
  match?: DraftMatch;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function renderHighlighted(text: string, ranges: HighlightRange[]): ReactNode {
  if (ranges.length === 0) {
    return text;
  }
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const [index, range] of ranges.entries()) {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start));
    }
    nodes.push(
      <mark
        key={index}
        className="bg-transparent text-ink font-semibold underline decoration-1 underline-offset-[2px]"
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

/** A single draft entry in the rail: a two-line clamped title, a timestamp, an optional match snippet, and hover delete. */
export function DraftRow({
  draft,
  active,
  now,
  match,
  onSelect,
  onDelete,
}: DraftRowProps): ReactElement {
  const titleRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  const title = firstNonEmptyLine(draft.text);
  const isEmpty = title === null;
  const label = title ?? "New draft";
  const snippet = match?.snippet ?? null;

  useEffect(() => {
    const element = titleRef.current;
    if (element === null) {
      return;
    }
    setTruncated(element.scrollHeight > element.clientHeight + 1);
  }, [label, match?.titleRanges]);

  const row = (
    <button
      type="button"
      onClick={() => {
        onSelect(draft.id);
      }}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full rounded-[9px] px-2.5 py-[9px] text-left transition-colors",
        active ? "bg-raise-2 text-ink font-medium" : "text-ink-2 hover:bg-raise hover:text-ink",
      )}
    >
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span
          ref={titleRef}
          className={cn("line-clamp-2 text-[13px] leading-[1.45]", isEmpty && "text-ink-3")}
        >
          {match && match.titleRanges.length > 0
            ? renderHighlighted(label, match.titleRanges)
            : label}
        </span>
        <span className="text-ink-3 font-mono text-[10.5px] font-normal">
          {formatRelativeTime(draft.updatedAt, now)}
        </span>
        {snippet ? (
          <span className="text-ink-3 truncate text-[11px] leading-[1.4]">
            {renderHighlighted(snippet.text, snippet.ranges)}
          </span>
        ) : null}
      </span>
    </button>
  );

  const trigger =
    truncated && !isEmpty ? (
      <Tooltip>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    ) : (
      row
    );

  return (
    <div className="group relative">
      {trigger}
      <button
        type="button"
        onClick={() => {
          onDelete(draft.id);
        }}
        aria-label="Delete draft"
        className="text-ink-3 hover:bg-raise-2 hover:text-ink absolute right-1.5 top-1.5 rounded-[6px] p-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
