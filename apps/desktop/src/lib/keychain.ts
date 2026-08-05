import { Channel, invoke } from "@tauri-apps/api/core";

type KeychainResponse<TValue> =
  | { readonly status: "success"; readonly value: TValue }
  | { readonly status: "error"; readonly value: string };

function runKeychainCommand<TValue>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<TValue> {
  return new Promise((resolve, reject) => {
    const onComplete = new Channel<KeychainResponse<TValue>>();
    onComplete.onmessage = (response) => {
      if (response.status === "success") {
        resolve(response.value);
      } else {
        reject(new Error(response.value));
      }
    };
    void invoke(command, { ...args, onComplete }).catch(reject);
  });
}

/** Returns the stored API key, or `null` when none is set. */
export function getApiKey(): Promise<string | null> {
  return runKeychainCommand<string | null>("get_api_key");
}

/** Stores the API key in the macOS keychain. */
export async function setApiKey(key: string): Promise<void> {
  await runKeychainCommand<null>("set_api_key", { key });
}

/** Removes the stored API key; succeeds even when none is set. */
export async function deleteApiKey(): Promise<void> {
  await runKeychainCommand<null>("delete_api_key");
}
