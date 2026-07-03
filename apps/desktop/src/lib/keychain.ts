import { invoke } from "@tauri-apps/api/core";

/** Returns the stored API key, or `null` when none is set. */
export async function getApiKey(): Promise<string | null> {
  return invoke<string | null>("get_api_key");
}

/** Stores the API key in the macOS keychain. */
export async function setApiKey(key: string): Promise<void> {
  await invoke("set_api_key", { key });
}

/** Removes the stored API key; succeeds even when none is set. */
export async function deleteApiKey(): Promise<void> {
  await invoke("delete_api_key");
}
