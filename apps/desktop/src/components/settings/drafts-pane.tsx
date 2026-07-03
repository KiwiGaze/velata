import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from "@velata/ui";
import { type ReactElement } from "react";

import { useSettings } from "@/hooks/use-settings";

import { PaneHeader, SettingsRow } from "./primitives";

export function DraftsPane(): ReactElement {
  const { settings, updateSettings } = useSettings();

  return (
    <section>
      <PaneHeader title="Drafts" subtitle="How the draft list behaves." />
      <SettingsRow
        label="When summoned"
        description="Open a fresh draft or continue the one you last worked on."
      >
        <Select
          value={settings.summonBehavior}
          onValueChange={(value) => {
            void updateSettings({
              summonBehavior: value === "recent-draft" ? "recent-draft" : "new-draft",
            });
          }}
        >
          <SelectTrigger className="w-[220px]" aria-label="When summoned">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new-draft">New draft</SelectItem>
            <SelectItem value="recent-draft">Most recent draft</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow
        label="Reuse empty draft on open"
        description="Don't create a new blank draft if the current one is still empty."
      >
        <Switch
          checked={settings.reuseEmptyDraft}
          onCheckedChange={(next) => {
            void updateSettings({ reuseEmptyDraft: next });
          }}
          aria-label="Reuse empty draft on open"
        />
      </SettingsRow>
      <SettingsRow
        label="Keep draft history"
        description="Drafts stay in the list after sending, so nothing is lost."
      >
        <Switch
          checked={settings.keepDraftHistory}
          onCheckedChange={(next) => {
            void updateSettings({ keepDraftHistory: next });
          }}
          aria-label="Keep draft history"
        />
      </SettingsRow>
    </section>
  );
}
