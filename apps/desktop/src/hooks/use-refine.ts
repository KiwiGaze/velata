import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { type Instruction, refine } from "@velata/core";
import { useCallback } from "react";

import { useSettings } from "@/hooks/use-settings";
import { getApiKey } from "@/lib/keychain";

/** Thrown when a refine is attempted with no API key stored in the keychain. */
export class MissingApiKeyError extends Error {
  public override readonly name = "MissingApiKeyError";
  public constructor() {
    super("No API key configured");
  }
}

/** Thrown when a refine is attempted with no model configured in settings. */
export class MissingModelError extends Error {
  public override readonly name = "MissingModelError";
  public constructor() {
    super("No model configured");
  }
}

/** Runs an instruction against the configured provider and returns the refined text. */
export type RefineFn = (
  instruction: Instruction,
  input: string,
  signal?: AbortSignal,
) => Promise<string>;

/**
 * Provides a refine function bound to the current settings and stored API key.
 * Throws `MissingApiKeyError` or `MissingModelError` when configuration is absent.
 */
export function useRefine(): RefineFn {
  const { settings } = useSettings();
  return useCallback<RefineFn>(
    async (instruction, input, signal) => {
      const apiKey = await getApiKey();
      if (apiKey === null || apiKey.length === 0) {
        throw new MissingApiKeyError();
      }
      if (settings.model.length === 0) {
        throw new MissingModelError();
      }
      return refine({
        baseUrl: settings.baseUrl,
        apiKey,
        model: settings.model,
        instruction,
        input,
        fetchImpl: tauriFetch,
        ...(signal ? { signal } : {}),
      });
    },
    [settings.baseUrl, settings.model],
  );
}
