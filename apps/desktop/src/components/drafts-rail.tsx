import { cn, Input, ScrollArea, TooltipProvider } from "@velata/ui";
import { ALargeSmall, Menu, Search, SquarePen, X } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";

import { DraftRow } from "@/components/draft-row";
import { type Draft } from "@/hooks/use-drafts";
import { searchDrafts } from "@/lib/draft-search";

const NOW_REFRESH_MS = 60_000;

interface DraftsRailProps {
  open: boolean;
  drafts: Draft[];
  activeId: string;
  formattingOpen: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onToggleOpen: () => void;
  onToggleFormatting: () => void;
}

/** The collapsible left rail: a pinned new-draft row, draft search, filtered results, and a formatting toggle. */
export function DraftsRail({
  open,
  drafts,
  activeId,
  formattingOpen,
  onSelect,
  onDelete,
  onCreate,
  onToggleOpen,
  onToggleFormatting,
}: DraftsRailProps): ReactElement {
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");

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

  const results = searchDrafts(drafts, query);
  const noMatches = query.trim().length > 0 && results.length === 0;

  function handleCreate(): void {
    setQuery("");
    onCreate();
  }

  return (
    <aside
      className={cn(
        "border-line flex w-[52px] flex-none flex-col overflow-hidden border-r transition-[width] duration-200 ease-out",
        open && "w-[228px]",
      )}
    >
      <TooltipProvider>
        <div data-tauri-drag-region="deep" className="flex h-[52px] flex-none items-center px-3">
          <button
            type="button"
            onClick={onToggleOpen}
            aria-expanded={open}
            aria-label={`Drafts (${drafts.length.toString()} ${drafts.length === 1 ? "draft" : "drafts"})`}
            className="text-ink-2 hover:bg-raise hover:text-ink flex size-8 items-center justify-center rounded-[7px] transition-colors"
          >
            <Menu aria-hidden className="size-4" />
          </button>
        </div>
        <div
          inert={!open}
          aria-hidden={!open}
          className={cn(
            "flex min-h-0 w-[228px] flex-1 flex-col px-2 pb-3 transition-opacity duration-150",
            open ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="text-ink-3 px-2.5 pb-1.5 font-mono text-[10.5px] uppercase tracking-[0.09em]">
            Drafts
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="text-ink-3 hover:bg-raise hover:text-ink-2 flex items-center gap-[9px] rounded-[9px] px-2.5 py-[9px] text-left text-[13px] transition-colors"
          >
            <SquarePen aria-hidden className="size-3.5" />
            New draft
          </button>
          <div className="relative mb-1.5 mt-1">
            <Search
              aria-hidden
              className="text-ink-3 pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2"
            />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query.length > 0) {
                  event.stopPropagation();
                  setQuery("");
                }
              }}
              placeholder="Search drafts"
              aria-label="Search drafts"
              className="h-8 pl-8 pr-7"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                }}
                aria-label="Clear search"
                className="text-ink-3 hover:bg-raise-2 hover:text-ink absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[6px] p-1 transition-colors"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            )}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-px">
              {noMatches ? (
                <div className="text-ink-3 px-2.5 py-4 text-center text-[12px]">
                  No matching drafts
                </div>
              ) : (
                results.map(({ draft, match }) => (
                  <DraftRow
                    key={draft.id}
                    draft={draft}
                    active={draft.id === activeId}
                    now={now}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    {...(match ? { match } : {})}
                  />
                ))
              )}
            </div>
          </ScrollArea>
          <div className="border-line mt-2 border-t pt-2">
            <button
              type="button"
              onClick={onToggleFormatting}
              aria-pressed={formattingOpen}
              className={cn(
                "flex w-full items-center gap-[9px] rounded-[9px] px-2.5 py-[9px] text-left text-[13px] transition-colors",
                formattingOpen
                  ? "bg-raise-2 text-ink"
                  : "text-ink-3 hover:bg-raise hover:text-ink-2",
              )}
            >
              <ALargeSmall aria-hidden className="size-3.5" />
              Formatting
            </button>
          </div>
        </div>
      </TooltipProvider>
    </aside>
  );
}
