/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AppSettings } from "@/lib/settings";

const settingsMocks = vi.hoisted(() => {
  const defaultSettings: AppSettings = {
    launchAtLogin: false,
    provider: "",
    baseUrl: "",
    model: "",
    instructions: [],
    summonBehavior: "new-draft",
    reuseEmptyDraft: true,
    keepDraftHistory: true,
    onboarded: false,
  };
  return {
    defaultSettings,
    loadSettings: vi.fn<() => Promise<AppSettings>>(),
    saveSettings: vi.fn<(next: AppSettings) => Promise<void>>(),
    subscribeSettings: vi.fn<(onChange: (settings: AppSettings) => void) => Promise<() => void>>(),
  };
});

vi.mock("@/lib/settings", () => ({
  DEFAULT_SETTINGS: settingsMocks.defaultSettings,
  loadSettings: settingsMocks.loadSettings,
  saveSettings: settingsMocks.saveSettings,
  subscribeSettings: settingsMocks.subscribeSettings,
}));

const { SettingsProvider, useSettings } = await import("./use-settings");

function UpdatingProbe(): ReactElement {
  const { updateSettings } = useSettings();
  useEffect(() => {
    void updateSettings({ provider: "openai" });
    void updateSettings({ model: "gpt-4.1" });
  }, [updateSettings]);
  return createElement("span", null, "ready");
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("SettingsProvider", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    if (root !== null) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("persists sequential updates against the latest settings snapshot", async () => {
    settingsMocks.loadSettings.mockResolvedValue(settingsMocks.defaultSettings);
    settingsMocks.saveSettings.mockResolvedValue(undefined);
    settingsMocks.subscribeSettings.mockResolvedValue(() => undefined);

    const container = document.createElement("div");
    root = createRoot(container);

    act(() => {
      root?.render(createElement(SettingsProvider, null, createElement(UpdatingProbe)));
    });
    await flush();

    expect(settingsMocks.saveSettings).toHaveBeenNthCalledWith(1, {
      ...settingsMocks.defaultSettings,
      provider: "openai",
    });
    expect(settingsMocks.saveSettings).toHaveBeenNthCalledWith(2, {
      ...settingsMocks.defaultSettings,
      provider: "openai",
      model: "gpt-4.1",
    });
  });
});
