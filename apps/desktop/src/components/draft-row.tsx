import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@velata/ui";
import { Trash2 } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";

import { type Draft } from "@/hooks/use-drafts";
import { formatRelativeTime } from "@/lib/relative-time";

interface DraftRowProps {
  draft: Draft;
  active: boolean;
  now: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function firstNonEmptyLine(text: string): string | null {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

/** A single draft entry in the rail: a two-line clamped title, a timestamp, and hover delete. */
export function DraftRow({ draft, active, now, onSelect, onDelete }: DraftRowProps): ReactElement {
  const titleRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  const title = firstNonEmptyLine(draft.text);
  const isEmpty = title === null;
  const label = title ?? "New draft";

  useEffect(() => {
    const element = titleRef.current;
    if (element === null) {
      return;
    }
    setTruncated(element.scrollHeight > element.clientHeight + 1);
  }, [label]);

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
          {label}
        </span>
        <span className="text-ink-3 font-mono text-[10.5px] font-normal">
          {formatRelativeTime(draft.updatedAt, now)}
        </span>
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
