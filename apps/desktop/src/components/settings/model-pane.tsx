import { testConnection } from "@velata/core";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@velata/ui";
import { type ReactElement, useEffect, useRef, useState } from "react";

import { useSettings } from "@/hooks/use-settings";
import { testCodexSparkConnection } from "@/lib/codex-spark";
import { tauriFetch } from "@/lib/http";
import { deleteApiKey, getApiKey, setApiKey } from "@/lib/keychain";
import { CODEX_SPARK_MODEL, CODEX_SPARK_PROVIDER, PROVIDERS } from "@/lib/providers";
import { describeRefineError } from "@/lib/refine-errors";

import { PaneHeader, SettingsRow } from "./primitives";

type TestStatus =
  | { kind: "idle" }
  | { kind: "note"; message: string }
  | { kind: "testing" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

const KEY_READ_ERROR_MESSAGE = "Could not read API key from Keychain.";
const KEY_SAVE_ERROR_MESSAGE = "Could not save API key.";
const KEY_DELETE_ERROR_MESSAGE = "Could not remove API key.";

function statusLabel(status: TestStatus): string {
  switch (status.kind) {
    case "idle":
      return "not tested";
    case "note":
      return status.message;
    case "testing":
      return "testing…";
    case "ok":
      return "✓ connected";
    case "error":
      return `✗ ${status.message}`;
  }
}

export function ModelPane(): ReactElement {
  const { settings, updateSettings } = useSettings();
  const [baseUrlInput, setBaseUrlInput] = useState(settings.baseUrl);
  const [modelInput, setModelInput] = useState(settings.model);
  const [keyInput, setKeyInput] = useState("");
  const [keyStored, setKeyStored] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<TestStatus>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const keyOperationGenerationRef = useRef(0);

  useEffect(() => {
    setBaseUrlInput(settings.baseUrl);
  }, [settings.baseUrl]);

  useEffect(() => {
    setModelInput(settings.model);
  }, [settings.model]);

  useEffect(() => {
    const generation = ++keyOperationGenerationRef.current;
    setKeyError(null);
    if (settings.provider === CODEX_SPARK_PROVIDER) {
      return;
    }
    void (async () => {
      try {
        const key = await getApiKey();
        if (keyOperationGenerationRef.current === generation) {
          setKeyStored(key !== null);
        }
      } catch {
        if (keyOperationGenerationRef.current === generation) {
          setKeyError(KEY_READ_ERROR_MESSAGE);
        }
      }
    })();
    return () => {
      keyOperationGenerationRef.current += 1;
    };
  }, [settings.provider]);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ kind: "idle" });
    return () => {
      abortRef.current?.abort();
    };
  }, [settings.provider]);

  function handleProviderChange(value: string): void {
    const option = PROVIDERS.find((item) => item.value === value);
    if (option === undefined) {
      return;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ kind: "idle" });
    void updateSettings(
      option.baseUrl === null
        ? { provider: option.value }
        : { provider: option.value, baseUrl: option.baseUrl },
    );
  }

  function persistBaseUrl(): void {
    if (baseUrlInput !== settings.baseUrl) {
      void updateSettings({ baseUrl: baseUrlInput });
    }
  }

  function persistModel(): void {
    if (modelInput !== settings.model) {
      void updateSettings({ model: modelInput });
    }
  }

  async function recoverKeyStored(mutationGeneration: number): Promise<void> {
    if (keyOperationGenerationRef.current !== mutationGeneration) {
      return;
    }
    const recoveryGeneration = ++keyOperationGenerationRef.current;
    try {
      const key = await getApiKey();
      if (keyOperationGenerationRef.current === recoveryGeneration) {
        setKeyStored(key !== null);
      }
    } catch {
      return;
    }
  }

  async function handleKeyMutationFailure(generation: number, message: string): Promise<void> {
    if (keyOperationGenerationRef.current !== generation) {
      return;
    }
    setKeyError(message);
    await recoverKeyStored(generation);
  }

  function beginKeyMutation(): number {
    const generation = ++keyOperationGenerationRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ kind: "idle" });
    setKeyError(null);
    return generation;
  }

  function saveKey(): void {
    const value = keyInput.trim();
    if (value === "") {
      return;
    }
    const generation = beginKeyMutation();
    void (async () => {
      try {
        await setApiKey(value);
      } catch {
        await handleKeyMutationFailure(generation, KEY_SAVE_ERROR_MESSAGE);
        return;
      }
      if (keyOperationGenerationRef.current !== generation) {
        return;
      }
      setKeyInput("");
      setShowKey(false);
      setKeyStored(true);
    })();
  }

  function removeKey(): void {
    const generation = beginKeyMutation();
    void (async () => {
      try {
        await deleteApiKey();
      } catch {
        await handleKeyMutationFailure(generation, KEY_DELETE_ERROR_MESSAGE);
        return;
      }
      if (keyOperationGenerationRef.current !== generation) {
        return;
      }
      setKeyStored(false);
    })();
  }

  function handleTest(): void {
    void (async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus({ kind: "testing" });
      try {
        if (settings.provider === CODEX_SPARK_PROVIDER) {
          const result = await testCodexSparkConnection(controller.signal);
          if (!controller.signal.aborted) {
            setStatus(result.ok ? { kind: "ok" } : { kind: "error", message: result.error });
          }
          return;
        }
        let apiKey = keyInput.trim();
        if (apiKey === "") {
          try {
            apiKey = (await getApiKey()) ?? "";
          } catch {
            if (!controller.signal.aborted) {
              setKeyError(KEY_READ_ERROR_MESSAGE);
              setStatus({ kind: "idle" });
            }
            return;
          }
          if (controller.signal.aborted) {
            return;
          }
        }
        const baseUrl = baseUrlInput.trim();
        const model = modelInput.trim();
        if (apiKey === "" || baseUrl === "" || model === "") {
          setStatus({ kind: "note", message: "Add a base URL, model, and API key first." });
          return;
        }
        const result = await testConnection({
          baseUrl,
          apiKey,
          model,
          fetchImpl: tauriFetch,
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        setStatus(result.ok ? { kind: "ok" } : { kind: "error", message: result.error });
      } catch (error) {
        if (!controller.signal.aborted) {
          setStatus({ kind: "error", message: describeRefineError(error) });
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    })();
  }

  const keyPlaceholder = keyStored ? "•••••••••••• (stored in keychain)" : "Paste your API key";

  return (
    <section>
      <PaneHeader
        title="Model"
        subtitle="Local mode uses direct HTTP providers or your installed Codex CLI."
      />
      <SettingsRow label="Provider">
        <Select value={settings.provider} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-[220px]" aria-label="Provider">
            <SelectValue placeholder="Select a provider" />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>

      {settings.provider === CODEX_SPARK_PROVIDER ? (
        <>
          <SettingsRow label="Model">
            <Input className="w-[220px]" value={CODEX_SPARK_MODEL} aria-label="Model" readOnly />
          </SettingsRow>
          <SettingsRow
            label="Codex CLI"
            description="Install or update Codex CLI, run codex login, and use a ChatGPT Pro account with Spark access. Velata does not read CLI credentials."
          >
            <span className="text-ink-3 max-w-[220px] text-right text-[12px] leading-[1.45]">
              Uses your existing CLI login
            </span>
          </SettingsRow>
        </>
      ) : (
        <>
          <div className="border-line flex flex-col gap-2.5 border-b py-[15px]">
            <Label htmlFor="model-base-url">API base URL</Label>
            <Input
              id="model-base-url"
              value={baseUrlInput}
              placeholder="https://api.openai.com/v1"
              onChange={(event) => {
                setBaseUrlInput(event.target.value);
              }}
              onBlur={persistBaseUrl}
            />
          </div>

          <div className="border-line flex flex-col gap-2.5 border-b py-[15px]">
            <div className="flex items-baseline justify-between gap-4">
              <Label htmlFor="model-api-key">API key</Label>
              {keyInput !== "" ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    setShowKey((prev) => !prev);
                  }}
                >
                  {showKey ? "Hide" : "Show"}
                </Button>
              ) : keyStored ? (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={removeKey}>
                  Remove
                </Button>
              ) : null}
            </div>
            <Input
              id="model-api-key"
              type={showKey ? "text" : "password"}
              value={keyInput}
              placeholder={keyPlaceholder}
              autoComplete="off"
              onChange={(event) => {
                setKeyInput(event.target.value);
              }}
              onBlur={saveKey}
            />
            <p className="text-ink-3 text-[12px] leading-[1.45]">
              Stored in your device keychain. Local-mode requests go only to this endpoint, never to
              Velata.
            </p>
            {keyError === null ? null : (
              <span className="text-ink-2 font-mono text-[11px]" role="status" aria-live="polite">
                ✗ {keyError}
              </span>
            )}
          </div>

          <SettingsRow label="Model">
            <Input
              className="w-[220px]"
              value={modelInput}
              placeholder="glm-4-plus"
              aria-label="Model"
              onChange={(event) => {
                setModelInput(event.target.value);
              }}
              onBlur={persistModel}
            />
          </SettingsRow>
        </>
      )}

      <SettingsRow label="Connection">
        <span className="text-ink-2 font-mono text-[11px]">{statusLabel(status)}</span>
        <Button variant="ghost" size="sm" onClick={handleTest}>
          Test
        </Button>
      </SettingsRow>
    </section>
  );
}
