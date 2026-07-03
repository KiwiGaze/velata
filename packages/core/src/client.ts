import { type Instruction } from "./instruction";
import { buildMessages, type ChatMessage } from "./prompt";

/** Parameters for a single refine request against an OpenAI-compatible endpoint. */
export interface RefineParams {
  /** Provider base URL, e.g. `https://open.bigmodel.cn/api/paas/v4` (no `/chat/completions`). */
  baseUrl: string;
  apiKey: string;
  model: string;
  instruction: Instruction;
  input: string;
  signal?: AbortSignal;
  /** Injectable fetch; defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
}

/** Parameters for a lightweight connection test. */
export interface ConnectionParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Outcome of a connection test: ok, or a human-readable error. */
export type ConnectionResult = { ok: true } | { ok: false; error: string };

interface ChatCompletionRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  fetchImpl: typeof fetch;
}

/**
 * Rewrites the input via an OpenAI-compatible `/chat/completions` call and
 * returns the trimmed refined text. Throws on a non-2xx response or an
 * unexpected response shape.
 */
export async function refine(params: RefineParams): Promise<string> {
  const request: ChatCompletionRequest = {
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    model: params.model,
    messages: buildMessages(params.instruction, params.input),
    fetchImpl: params.fetchImpl ?? globalThis.fetch,
    ...(params.signal ? { signal: params.signal } : {}),
  };
  return requestChatCompletion(request);
}

/**
 * Issues a minimal request to verify the endpoint, key, and model. Never
 * throws: returns `{ ok: true }` on success or `{ ok: false, error }` otherwise.
 */
export async function testConnection(params: ConnectionParams): Promise<ConnectionResult> {
  const request: ChatCompletionRequest = {
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    model: params.model,
    messages: [{ role: "user", content: "ping" }],
    fetchImpl: params.fetchImpl ?? globalThis.fetch,
    ...(params.signal ? { signal: params.signal } : {}),
  };
  try {
    await requestChatCompletion(request);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

async function requestChatCompletion(request: ChatCompletionRequest): Promise<string> {
  const url = buildChatCompletionsUrl(request.baseUrl);
  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: 0.2,
      stream: false,
    }),
    ...(request.signal ? { signal: request.signal } : {}),
  };
  const response = await request.fetchImpl(url, init);
  if (!response.ok) {
    throw new Error(await buildErrorMessage(response));
  }
  const payload = (await response.json()) as unknown;
  return parseRefinedText(payload);
}

function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

const REASONING_ONLY_ERROR =
  "The model returned only reasoning, no refined text. Try a non-reasoning model.";

const LEADING_THINK_BLOCK = /^\s*<think>[\s\S]*?<\/think>\s*/i;
const LEADING_THINK_TAG = /^\s*<think>/i;

/** Removes a leading `<think>…</think>` reasoning block, then trims. */
function stripReasoning(content: string): string {
  return content.replace(LEADING_THINK_BLOCK, "").trim();
}

function parseRefinedText(payload: unknown): string {
  const message = extractMessage(payload);
  const rawContent = message?.["content"];
  if (typeof rawContent !== "string") {
    if (message !== undefined && hasReasoning(message)) {
      throw new Error(REASONING_ONLY_ERROR);
    }
    throw new Error("Unexpected response: missing choices[0].message.content");
  }
  const cleaned = stripReasoning(rawContent);
  if (LEADING_THINK_TAG.test(cleaned)) {
    throw new Error(REASONING_ONLY_ERROR);
  }
  if (
    cleaned.length === 0 &&
    (LEADING_THINK_TAG.test(rawContent) || (message !== undefined && hasReasoning(message)))
  ) {
    throw new Error(REASONING_ONLY_ERROR);
  }
  return cleaned;
}

function extractMessage(payload: unknown): Record<string, unknown> | undefined {
  const root = asRecord(payload);
  const choices = root?.["choices"];
  if (!Array.isArray(choices)) {
    return undefined;
  }
  const first = asRecord((choices as unknown[])[0]);
  return asRecord(first?.["message"]);
}

function hasReasoning(message: Record<string, unknown>): boolean {
  const reasoning = message["reasoning"];
  return typeof reasoning === "string" && reasoning.trim().length > 0;
}

async function buildErrorMessage(response: Response): Promise<string> {
  const detail = await readErrorDetail(response);
  const base = `Request failed with status ${String(response.status)}`;
  return detail === undefined ? base : `${base}: ${detail}`;
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    return extractProviderMessage(JSON.parse(trimmed) as unknown) ?? trimmed;
  } catch {
    return trimmed;
  }
}

function extractProviderMessage(body: unknown): string | undefined {
  const record = asRecord(body);
  if (record === undefined) {
    return undefined;
  }
  const error = record["error"];
  if (typeof error === "string") {
    return error;
  }
  const nested = asRecord(error)?.["message"];
  if (typeof nested === "string") {
    return nested;
  }
  const message = record["message"];
  return typeof message === "string" ? message : undefined;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
