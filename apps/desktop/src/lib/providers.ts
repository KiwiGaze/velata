export const CODEX_SPARK_PROVIDER = "codex-spark";
export const CODEX_SPARK_MODEL = "gpt-5.3-codex-spark";

/** A selectable provider; null means it has no preset HTTP base URL. */
export interface ProviderOption {
  value: string;
  label: string;
  baseUrl: string | null;
  /** Default model id; empty when the user must supply one. */
  model: string;
}

/** Built-in providers, plus a custom entry for any OpenAI-compatible endpoint. */
export const PROVIDERS: readonly ProviderOption[] = [
  {
    value: CODEX_SPARK_PROVIDER,
    label: "Codex Spark",
    baseUrl: null,
    model: CODEX_SPARK_MODEL,
  },
  {
    value: "glm",
    label: "GLM (Zhipu)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-plus",
  },
  { value: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1" },
  {
    value: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    model: "gemma-4-31b",
  },
  {
    value: "kimi",
    label: "Kimi (Moonshot)",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
  },
  { value: "custom", label: "Custom…", baseUrl: null, model: "" },
];

/** Returns the model used by the active provider without changing stored HTTP settings. */
export function getActiveModel(provider: string, configuredModel: string): string {
  return provider === CODEX_SPARK_PROVIDER ? CODEX_SPARK_MODEL : configuredModel;
}
