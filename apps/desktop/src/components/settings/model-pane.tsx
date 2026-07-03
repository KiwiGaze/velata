import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
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
import { deleteApiKey, getApiKey, setApiKey } from "@/lib/keychain";

import { PaneHeader, SettingsRow } from "./primitives";

interface ProviderOption {
  value: string;
  label: string;
  baseUrl: string | null;
}

const PROVIDERS: readonly ProviderOption[] = [
  { value: "glm", label: "GLM (Zhipu)", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { value: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { value: "cerebras", label: "Cerebras", baseUrl: "https://api.cerebras.ai/v1" },
  { value: "kimi", label: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.cn/v1" },
  { value: "custom", label: "Custom…", baseUrl: null },
];

type TestStatus =
  | { kind: "idle" }
  | { kind: "note"; message: string }
  | { kind: "testing" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

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
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<TestStatus>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setBaseUrlInput(settings.baseUrl);
  }, [settings.baseUrl]);

  useEffect(() => {
    setModelInput(settings.model);
  }, [settings.model]);

  useEffect(() => {
    let active = true;
    void getApiKey().then((key) => {
      if (active) {
        setKeyStored(key !== null);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  function handleProviderChange(value: string): void {
    const option = PROVIDERS.find((item) => item.value === value);
    if (option === undefined) {
      return;
    }
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

  function saveKey(): void {
    const value = keyInput.trim();
    if (value === "") {
      return;
    }
    void setApiKey(value).then(() => {
      setKeyInput("");
      setShowKey(false);
      setKeyStored(true);
    });
  }

  function removeKey(): void {
    void deleteApiKey().then(() => {
      setKeyStored(false);
    });
  }

  function handleTest(): void {
    void (async () => {
      try {
        const apiKey = keyInput.trim() !== "" ? keyInput.trim() : ((await getApiKey()) ?? "");
        const baseUrl = baseUrlInput.trim();
        const model = modelInput.trim();
        if (apiKey === "" || baseUrl === "" || model === "") {
          setStatus({ kind: "note", message: "Add a base URL, model, and API key first." });
          return;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setStatus({ kind: "testing" });
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
        setStatus({
          kind: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    })();
  }

  const keyPlaceholder = keyStored ? "•••••••••••• (stored in keychain)" : "Paste your API key";

  return (
    <section>
      <PaneHeader
        title="Model"
        subtitle="Bring your own key. Any OpenAI-compatible endpoint works."
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
          Stored in your device keychain. It only ever goes to your provider — never to us.
        </p>
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

      <SettingsRow label="Connection">
        <span className="text-ink-2 font-mono text-[11px]">{statusLabel(status)}</span>
        <Button variant="ghost" size="sm" onClick={handleTest}>
          Test
        </Button>
      </SettingsRow>
    </section>
  );
}
