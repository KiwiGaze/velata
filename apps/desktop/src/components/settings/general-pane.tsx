import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Kbd, Switch } from "@velata/ui";
import { type ReactElement, useEffect, useState } from "react";

import { useSettings } from "@/hooks/use-settings";

import { PaneHeader, SettingsRow } from "./primitives";

export function GeneralPane(): ReactElement {
  const { settings, updateSettings } = useSettings();
  const [launchAtLogin, setLaunchAtLogin] = useState(settings.launchAtLogin);

  useEffect(() => {
    let active = true;
    void isEnabled().then((enabled) => {
      if (active) {
        setLaunchAtLogin(enabled);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  function handleLaunchToggle(next: boolean): void {
    setLaunchAtLogin(next);
    void (async () => {
      if (next) {
        await enable();
      } else {
        await disable();
      }
      await updateSettings({ launchAtLogin: next });
    })();
  }

  return (
    <section>
      <PaneHeader title="General" subtitle="How Velata launches and behaves." />
      <SettingsRow label="Global shortcut" description="Summon Velata from any app.">
        <Kbd>⌘</Kbd>
        <Kbd>⇧</Kbd>
        <Kbd>Space</Kbd>
      </SettingsRow>
      <SettingsRow label="Launch at login">
        <Switch
          checked={launchAtLogin}
          onCheckedChange={handleLaunchToggle}
          aria-label="Launch at login"
        />
      </SettingsRow>
    </section>
  );
}
