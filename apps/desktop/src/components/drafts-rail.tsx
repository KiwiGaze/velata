import { cn, ScrollArea, TooltipProvider } from "@velata/ui";
import { type ReactElement, useEffect, useState } from "react";

import { DraftRow } from "@/components/draft-row";
import { type Draft } from "@/hooks/use-drafts";

const NOW_REFRESH_MS = 60_000;

interface DraftsRailProps {
  open: boolean;
  drafts: Draft[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

/** The collapsible left rail listing every draft, with a trailing "new draft" row. */
export function DraftsRail({
  open,
  drafts,
  activeId,
  onSelect,
  onDelete,
  onCreate,
}: DraftsRailProps): ReactElement {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, NOW_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [open]);

  return (
    <aside
      inert={!open}
      className={cn(
        "border-line w-0 flex-none overflow-hidden border-r transition-[width] duration-200 ease-out",
        open && "w-[228px]",
      )}
    >
      <TooltipProvider>
        <div className="flex h-full w-[228px] flex-col px-2 pb-3 pt-2">
          <div className="text-ink-3 px-2.5 pb-1.5 pt-2 font-mono text-[10.5px] uppercase tracking-[0.09em]">
            Drafts
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-px">
              {drafts.map((draft) => (
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  active={draft.id === activeId}
                  now={now}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              ))}
              <button
                type="button"
                onClick={onCreate}
                className="text-ink-3 hover:bg-raise hover:text-ink-2 flex items-center gap-[9px] rounded-[9px] px-2.5 py-[9px] text-left text-[13px] transition-colors"
              >
                <span aria-hidden className="font-mono">
                  +
                </span>
                New draft
              </button>
            </div>
          </ScrollArea>
        </div>
      </TooltipProvider>
    </aside>
  );
}
