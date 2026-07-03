import { cn } from "@velata/ui";
import { type ReactElement, useState } from "react";

import { VelataMark } from "@/components/logo";

import { DraftsPane } from "./drafts-pane";
import { GeneralPane } from "./general-pane";
import { ModelPane } from "./model-pane";
import { RefinePane } from "./refine-pane";
import { ShortcutsPane } from "./shortcuts-pane";

type PaneId = "general" | "model" | "refine" | "drafts" | "shortcuts";

interface NavItem {
  id: PaneId;
  label: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: "general", label: "General" },
  { id: "model", label: "Model" },
  { id: "refine", label: "Refine" },
  { id: "drafts", label: "Drafts" },
  { id: "shortcuts", label: "Shortcuts" },
];

function renderPane(id: PaneId): ReactElement {
  switch (id) {
    case "general":
      return <GeneralPane />;
    case "model":
      return <ModelPane />;
    case "refine":
      return <RefinePane />;
    case "drafts":
      return <DraftsPane />;
    case "shortcuts":
      return <ShortcutsPane />;
  }
}

export function Settings(): ReactElement {
  const [active, setActive] = useState<PaneId>("general");

  return (
    <div className="bg-paper flex h-full">
      <nav className="border-line flex w-[186px] flex-none flex-col gap-0.5 border-r px-3 py-5">
        <div className="text-ink-3 flex items-center gap-2 px-2.5 pb-3.5 font-mono text-[11px]">
          <VelataMark size={13} className="text-ink-2 flex-none" />
          velata · 1.0
        </div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setActive(item.id);
            }}
            aria-current={active === item.id ? "page" : undefined}
            className={cn(
              "flex items-center rounded-[9px] px-2.5 py-2 text-left text-[13px] transition-colors",
              active === item.id
                ? "bg-raise-2 text-ink font-medium"
                : "text-ink-2 hover:bg-raise hover:text-ink",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto px-7 py-6">{renderPane(active)}</div>
    </div>
  );
}
