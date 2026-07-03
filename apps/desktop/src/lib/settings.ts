import { load } from "@tauri-apps/plugin-store";
import { DEFAULT_INSTRUCTION, type Instruction } from "@velata/core";

/** Non-secret application settings persisted to the settings store. */
export interface AppSettings {
  launchAtLogin: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  instructions: Instruction[];
  reuseEmptyDraft: boolean;
  keepDraftHistory: boolean;
  onboarded: boolean;
}

/** Defaults applied when the settings store is empty or a key is missing. */
export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  provider: "",
  baseUrl: "",
  model: "",
  instructions: [DEFAULT_INSTRUCTION],
  reuseEmptyDraft: true,
  keepDraftHistory: true,
  onboarded: false,
};

const STORE_PATH = "settings.json";
const STORE_OPTIONS = { defaults: {}, autoSave: true };
const SETTINGS_KEY = "settings";

/** Reads persisted settings, filling any missing key from `DEFAULT_SETTINGS`. */
export async function loadSettings(): Promise<AppSettings> {
  const store = await load(STORE_PATH, STORE_OPTIONS);
  const stored = await store.get<Partial<AppSettings>>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

/** Persists the full settings object to the settings store. */
export async function saveSettings(next: AppSettings): Promise<void> {
  const store = await load(STORE_PATH, STORE_OPTIONS);
  await store.set(SETTINGS_KEY, next);
  await store.save();
}

/**
 * Subscribes to settings changes from any window (the store broadcasts across
 * webviews), so a change made in the Settings window reaches the ScratchPad
 * live. Returns a function that removes the subscription.
 */
export async function subscribeSettings(
  onChange: (settings: AppSettings) => void,
): Promise<() => void> {
  const store = await load(STORE_PATH, STORE_OPTIONS);
  return store.onKeyChange<Partial<AppSettings>>(SETTINGS_KEY, (value) => {
    onChange({ ...DEFAULT_SETTINGS, ...(value ?? {}) });
  });
}
