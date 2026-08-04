/**
 * @vitest-environment jsdom
 */
import { type Instruction } from "@velata/core";
import { act, createElement, type ReactElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type LivePreview, type LivePreviewInputs, useLivePreview } from "./use-live-preview";
import { type RefineFn } from "./use-refine";

const CLEAN: Instruction = {
  id: "default",
  name: "Clean up",
  prompt: "clean {target}",
  targetLanguage: "match-input",
  isDefault: true,
};

interface Deferred {
  promise: Promise<string>;
  resolve: (value: string) => void;
}

function deferred(): Deferred {
  let resolve: (value: string) => void = () => undefined;
  const promise = new Promise<string>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

interface RecordedCall {
  signal: AbortSignal;
  deferred: Deferred;
}

function createRefine(calls: RecordedCall[]): RefineFn {
  return (_instruction, _input, signal) => {
    if (signal === undefined) {
      throw new Error("Live preview did not provide an abort signal");
    }
    const call = { signal, deferred: deferred() };
    calls.push(call);
    return call.deferred.promise;
  };
}

function PreviewProbe({
  inputs,
  onState,
}: {
  inputs: LivePreviewInputs;
  onState: (state: LivePreview) => void;
}): ReactElement {
  const state = useLivePreview(inputs);
  useEffect(() => {
    onState(state);
  }, [onState, state]);
  return createElement("span", null, state.phase);
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("useLivePreview", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (root !== null) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("cancels old provider work and rejects its late result", async () => {
    const openAiCalls: RecordedCall[] = [];
    const sparkCalls: RecordedCall[] = [];
    const openAiRefine = createRefine(openAiCalls);
    const sparkRefine = createRefine(sparkCalls);
    const states: LivePreview[] = [];
    const onState = (state: LivePreview): void => {
      states.push(state);
    };
    const container = document.createElement("div");
    root = createRoot(container);

    const render = (provider: string, refine: RefineFn): void => {
      act(() => {
        root?.render(
          createElement(PreviewProbe, {
            inputs: {
              enabled: true,
              source: "same draft",
              draftId: "d1",
              instruction: CLEAN,
              provider,
              refine,
            },
            onState,
          }),
        );
      });
    };

    render("openai", openAiRefine);
    act(() => {
      vi.runAllTimers();
    });
    expect(openAiCalls).toHaveLength(1);

    render("codex-spark", sparkRefine);
    expect(openAiCalls[0]?.signal.aborted).toBe(true);
    expect(sparkCalls).toHaveLength(1);

    await act(async () => {
      openAiCalls[0]?.deferred.resolve("stale HTTP result");
      await flush();
    });
    expect(states.at(-1)).toMatchObject({ text: "", phase: "refreshing", draftKey: "d1" });

    await act(async () => {
      sparkCalls[0]?.deferred.resolve("current Spark result");
      await flush();
    });
    expect(states.at(-1)).toMatchObject({
      text: "current Spark result",
      phase: "ready",
      draftKey: "d1",
    });
  });
});
