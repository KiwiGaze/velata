import { getCurrentWindow } from "@tauri-apps/api/window";
import { type ReactElement, useEffect } from "react";

import { Onboarding } from "@/components/onboarding";
import { ScratchPad } from "@/components/scratch-pad";
import { useSettings } from "@/hooks/use-settings";

export function App(): ReactElement {
  const { settings, loading } = useSettings();

  useEffect(() => {
    if (loading || settings.onboarded) {
      return;
    }
    void (async () => {
      const appWindow = getCurrentWindow();
      await appWindow.show();
      await appWindow.setFocus();
    })();
  }, [loading, settings.onboarded]);

  return (
    <div className="h-full w-full px-10 pt-6 pb-16">
      <div className="shadow-sheet h-full w-full rounded-[18px]">
        {loading ? (
          <div className="bg-paper h-full rounded-[18px]" />
        ) : settings.onboarded ? (
          <ScratchPad />
        ) : (
          <Onboarding />
        )}
      </div>
    </div>
  );
}
