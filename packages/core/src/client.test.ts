import { describe, expect, it, vi } from "vitest";

import { refine, testConnection } from "./client";
import { DEFAULT_INSTRUCTION } from "./instruction";
import { buildSystemPrompt } from "./prompt";

interface CapturedCall {
  url: string;
  init: RequestInit;
}

interface RequestBody {
  model: string;
  messages: { role: string; content: string }[];
  temperature: number;
  stream: boolean;
}

const BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const API_KEY = "secret-key";
const MODEL = "glm-4";
const INPUT = "Add a dark mode toggle to the settings page.";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function mockFetch(handler: () => Response): {
  fetchImpl: typeof fetch;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const fetchImpl = vi.fn<typeof fetch>((input, init) => {
    calls.push({ url: requestUrl(input), init: init ?? {} });
    return Promise.resolve(handler());
  });
  return { fetchImpl, calls };
}

function chatResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function firstCall(calls: CapturedCall[]): CapturedCall {
  const call = calls[0];
  if (call === undefined) {
    throw new Error("fetch was not called");
  }
  return call;
}

describe("refine", () => {
  it("posts an OpenAI-compatible request and joins the trailing slash cleanly", async () => {
    const { fetchImpl, calls } = mockFetch(() => chatResponse(" hello "));

    const result = await refine({
      baseUrl: `${BASE_URL}/`,
      apiKey: API_KEY,
      model: MODEL,
      instruction: DEFAULT_INSTRUCTION,
      input: INPUT,
      fetchImpl,
    });

    expect(result).toBe("hello");
    expect(calls).toHaveLength(1);

    const call = firstCall(calls);
    expect(call.url).toBe(`${BASE_URL}/chat/completions`);
    expect(call.init.method).toBe("POST");

    const headers = call.init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${API_KEY}`);
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(call.init.body as string) as RequestBody;
    expect(body.model).toBe(MODEL);
    expect(body.temperature).toBe(0.2);
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: "system", content: buildSystemPrompt(DEFAULT_INSTRUCTION) },
      { role: "user", content: INPUT },
    ]);
  });

  it("joins a base URL without a trailing slash", async () => {
    const { fetchImpl, calls } = mockFetch(() => chatResponse("ok"));

    await refine({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      model: MODEL,
      instruction: DEFAULT_INSTRUCTION,
      input: INPUT,
      fetchImpl,
    });

    expect(firstCall(calls).url).toBe(`${BASE_URL}/chat/completions`);
  });

  it("throws with the status and provider message on a non-2xx response", async () => {
    const { fetchImpl } = mockFetch(() => errorResponse(401, "invalid api key"));

    const error = await refine({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      model: MODEL,
      instruction: DEFAULT_INSTRUCTION,
      input: INPUT,
      fetchImpl,
    }).catch((reason: unknown) => reason);

    if (!(error instanceof Error)) {
      throw new Error("expected refine to throw an Error");
    }
    expect(error.message).toContain("401");
    expect(error.message).toContain("invalid api key");
  });

  it("throws when the response is missing choices content", async () => {
    const { fetchImpl } = mockFetch(
      () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );

    await expect(
      refine({
        baseUrl: BASE_URL,
        apiKey: API_KEY,
        model: MODEL,
        instruction: DEFAULT_INSTRUCTION,
        input: INPUT,
        fetchImpl,
      }),
    ).rejects.toThrow();
  });
});

describe("testConnection", () => {
  it("returns ok on a 200 response", async () => {
    const { fetchImpl, calls } = mockFetch(() => chatResponse("pong"));

    const result = await testConnection({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      model: MODEL,
      fetchImpl,
    });

    expect(result).toEqual({ ok: true });
    expect(firstCall(calls).url).toBe(`${BASE_URL}/chat/completions`);
  });

  it("returns not-ok with the status on a failure response", async () => {
    const { fetchImpl } = mockFetch(() => errorResponse(500, "server exploded"));

    const result = await testConnection({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      model: MODEL,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected testConnection to report not-ok");
    }
    expect(result.error).toContain("500");
    expect(result.error).toContain("server exploded");
  });

  it("returns not-ok on a network error without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("network down")));

    const result = await testConnection({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      model: MODEL,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected testConnection to report not-ok");
    }
    expect(result.error).toContain("network down");
  });
});
