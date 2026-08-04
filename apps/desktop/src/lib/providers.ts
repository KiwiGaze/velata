/** A selectable model provider; `custom` carries a null base URL. */
export interface ProviderOption {
  value: string;
  label: string;
  baseUrl: string | null;
  /** Default model id; empty for the custom provider (user fills it in). */
  model: string;
}

/** Built-in OpenAI-compatible providers, plus a custom entry for any endpoint. */
export const PROVIDERS: readonly ProviderOption[] = [
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
