/**
 * @vitest-environment jsdom
 */
import { type Instruction, refine } from "@velata/core";
import { act, createElement, type ReactElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tauriFetch } from "@/lib/http";

import { type RefineFn } from "./use-refine";

const mocks = vi.hoisted(() => ({
  defaultInstruction: {
    id: "default",
    name: "Clean up",
    prompt: "Clean the input in {target}.",
    targetLanguage: "match-input",
    isDefault: true,
  } satisfies Instruction,
  getApiKey: vi.fn<() => Promise<string | null>>(),
  refineWithCodexSpark: vi.fn<RefineFn>(),
  settings: {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1",
  },
}));

vi.mock("@velata/core", () => ({
  DEFAULT_INSTRUCTION: mocks.defaultInstruction,
  refine: vi.fn(),
}));
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ settings: mocks.settings }),
}));
vi.mock("@/lib/codex-spark", () => ({
  refineWithCodexSpark: mocks.refineWithCodexSpark,
}));
vi.mock("@/lib/keychain", () => ({ getApiKey: mocks.getApiKey }));

const { MissingApiKeyError, MissingModelError, useRefine } = await import("./use-refine");
const refineMock = vi.mocked(refine);

function RefineProbe({ onReady }: { onReady: (refineFunction: RefineFn) => void }): ReactElement {
  const refineFunction = useRefine();
  useEffect(() => {
    onReady(refineFunction);
  }, [onReady, refineFunction]);
  return createElement("span", null, "ready");
}

describe("useRefine", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.settings = {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1",
    };
    mocks.getApiKey.mockResolvedValue("secret");
  });

  afterEach(() => {
    if (root !== null) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function renderRefine(): RefineFn {
    let refineFunction: RefineFn | undefined;
    const container = document.createElement("div");
    root = createRoot(container);
    act(() => {
      root?.render(
        createElement(RefineProbe, {
          onReady: (next) => {
            refineFunction = next;
          },
        }),
      );
    });
    if (refineFunction === undefined) {
      throw new Error("Refine hook did not initialize");
    }
    return refineFunction;
  }

  it("routes Spark only through the CLI adapter without reading the keychain", async () => {
    mocks.settings = { provider: "codex-spark", baseUrl: "", model: "" };
    mocks.refineWithCodexSpark.mockResolvedValue("clean draft");
    const refineFunction = renderRefine();

    await expect(refineFunction(mocks.defaultInstruction, "draft")).resolves.toBe("clean draft");

    expect(mocks.refineWithCodexSpark).toHaveBeenCalledWith(
      mocks.defaultInstruction,
      "draft",
      undefined,
    );
    expect(mocks.getApiKey).not.toHaveBeenCalled();
    expect(refineMock).not.toHaveBeenCalled();
  });

  it("preserves HTTP key validation and chat-completions routing", async () => {
    refineMock.mockResolvedValue("clean draft");
    const refineFunction = renderRefine();

    await expect(refineFunction(mocks.defaultInstruction, "draft")).resolves.toBe("clean draft");

    expect(mocks.getApiKey).toHaveBeenCalledOnce();
    expect(refineMock).toHaveBeenCalledOnce();
    expect(refineMock.mock.calls[0]?.[0]).toEqual({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      model: "gpt-4.1",
      instruction: mocks.defaultInstruction,
      input: "draft",
      fetchImpl: tauriFetch,
    });
    expect(mocks.refineWithCodexSpark).not.toHaveBeenCalled();
  });

  it("updates routing across HTTP, Spark, and HTTP on the same mount", async () => {
    refineMock.mockResolvedValue("http result");
    mocks.refineWithCodexSpark.mockResolvedValue("spark result");
    let refineFunction: RefineFn | undefined;
    const onReady = (next: RefineFn): void => {
      refineFunction = next;
    };
    const container = document.createElement("div");
    root = createRoot(container);
    const rerender = (): RefineFn => {
      act(() => {
        root?.render(createElement(RefineProbe, { onReady }));
      });
      if (refineFunction === undefined) {
        throw new Error("Refine hook did not initialize");
      }
      return refineFunction;
    };

    await expect(rerender()(mocks.defaultInstruction, "first")).resolves.toBe("http result");

    mocks.settings = { ...mocks.settings, provider: "codex-spark" };
    await expect(rerender()(mocks.defaultInstruction, "second")).resolves.toBe("spark result");

    mocks.settings = { ...mocks.settings, provider: "openai" };
    await expect(rerender()(mocks.defaultInstruction, "third")).resolves.toBe("http result");

    expect(refineMock).toHaveBeenCalledTimes(2);
    expect(mocks.refineWithCodexSpark).toHaveBeenCalledOnce();
    expect(mocks.getApiKey).toHaveBeenCalledTimes(2);
  });

  it("rejects an HTTP refine when the API key is missing", async () => {
    mocks.getApiKey.mockResolvedValue(null);
    const refineFunction = renderRefine();

    await expect(refineFunction(mocks.defaultInstruction, "draft")).rejects.toBeInstanceOf(
      MissingApiKeyError,
    );
    expect(refineMock).not.toHaveBeenCalled();
    expect(mocks.refineWithCodexSpark).not.toHaveBeenCalled();
  });

  it("rejects an HTTP refine when the model is missing", async () => {
    mocks.settings = { ...mocks.settings, model: "" };
    const refineFunction = renderRefine();

    await expect(refineFunction(mocks.defaultInstruction, "draft")).rejects.toBeInstanceOf(
      MissingModelError,
    );
    expect(refineMock).not.toHaveBeenCalled();
    expect(mocks.refineWithCodexSpark).not.toHaveBeenCalled();
  });
});
