import { type Instruction, refine } from "@velata/core";
import { useCallback } from "react";

import { useSettings } from "@/hooks/use-settings";
import { tauriFetch } from "@/lib/http";
import { getApiKey } from "@/lib/keychain";
import { MissingApiKeyError, MissingModelError } from "@/lib/refine-errors";

export { MissingApiKeyError, MissingModelError };

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
