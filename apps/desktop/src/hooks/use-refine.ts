import { type Instruction, refine } from "@velata/core";
import { useCallback } from "react";

import { useSettings } from "@/hooks/use-settings";
import { refineWithCodexSpark } from "@/lib/codex-spark";
import { tauriFetch } from "@/lib/http";
import { getApiKey } from "@/lib/keychain";
import { CODEX_SPARK_PROVIDER } from "@/lib/providers";
import { MissingApiKeyError, MissingModelError } from "@/lib/refine-errors";

export { MissingApiKeyError, MissingModelError };

/** Runs an instruction against the configured provider and returns the refined text. */
export type RefineFn = (
  instruction: Instruction,
  input: string,
  signal?: AbortSignal,
) => Promise<string>;

/**
 * Provides a refine function bound to the selected provider. HTTP providers
 * require a stored API key and configured model; Codex Spark uses neither.
 */
export function useRefine(): RefineFn {
  const { settings } = useSettings();
  return useCallback<RefineFn>(
    async (instruction, input, signal) => {
      if (settings.provider === CODEX_SPARK_PROVIDER) {
        return refineWithCodexSpark(instruction, input, signal);
      }
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
    [settings.baseUrl, settings.model, settings.provider],
  );
}
