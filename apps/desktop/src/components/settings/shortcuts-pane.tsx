import { Kbd } from "@velata/ui";
import { type ReactElement } from "react";

import { PaneHeader, SettingsRow } from "./primitives";

interface ShortcutEntry {
  label: string;
  keys: string;
}

const SHORTCUTS: readonly ShortcutEntry[] = [
  { label: "Refine", keys: "⌘K" },
  { label: "Copy & Close · keep draft", keys: "⌘↵" },
  { label: "Cut & Close · discard draft", keys: "⌘⇧↵" },
  { label: "Delete draft", keys: "⌘W" },
  { label: "Switch draft", keys: "⌘1–9" },
  { label: "Instruction palette", keys: "⌘P" },
  { label: "Settings", keys: "⌘," },
  { label: "Dismiss", keys: "esc" },
];

export function ShortcutsPane(): ReactElement {
  return (
    <section>
      <PaneHeader
        title="Shortcuts"
        subtitle="In-window keys. Voice input passes through to your dictation app."
      />
      {SHORTCUTS.map((entry) => (
        <SettingsRow key={entry.label} label={entry.label}>
          <Kbd>{entry.keys}</Kbd>
        </SettingsRow>
      ))}
    </section>
  );
}
