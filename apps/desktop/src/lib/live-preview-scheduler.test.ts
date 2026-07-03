import { type Instruction } from "@velata/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createLivePreviewScheduler,
  PREVIEW_DEBOUNCE_MS,
  previewCopyText,
  type PreviewState,
} from "./live-preview-scheduler";

const CLEAN: Instruction = {
  id: "default",
  name: "Clean up",
  prompt: "clean {target}",
  targetLanguage: "match-input",
  isDefault: true,
};

const STRUCTURE: Instruction = {
  id: "structure",
  name: "Structure",
  prompt: "structure {target}",
  targetLanguage: "match-input",
  isDefault: false,
};

interface Deferred {
  promise: Promise<string>;
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
}

function deferred(): Deferred {
  let resolve: (value: string) => void = () => undefined;
  let reject: (reason: Error) => void = () => undefined;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface RecordedCall {
  instruction: Instruction;
  input: string;
  signal: AbortSignal;
  deferred: Deferred;
}

interface Harness {
  states: PreviewState[];
  calls: RecordedCall[];
  scheduler: ReturnType<typeof createLivePreviewScheduler>;
}

function makeHarness(): Harness {
  const states: PreviewState[] = [];
  const calls: RecordedCall[] = [];
  const scheduler = createLivePreviewScheduler(
    (instruction, input, signal) => {
      const call: RecordedCall = { instruction, input, signal, deferred: deferred() };
      calls.push(call);
      return call.deferred.promise;
    },
    (state) => {
      states.push(state);
    },
  );
  return { states, calls, scheduler };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createLivePreviewScheduler", () => {
  it("fires one refine after the debounce window", async () => {
    const { states, calls, scheduler } = makeHarness();
    scheduler.schedule("draft one", CLEAN, "d1");
    scheduler.schedule("draft one more", CLEAN, "d1");
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("draft one more");
    calls[0]?.deferred.resolve("refined");
    await flush();
    expect(states.at(-1)).toEqual({ text: "refined", phase: "ready" });
  });

  it("restarts the debounce when the source changes", () => {
    const { calls, scheduler } = makeHarness();
    scheduler.schedule("a", CLEAN, "d1");
    vi.advanceTimersByTime(1000);
    scheduler.schedule("ab", CLEAN, "d1");
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS - 1000);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("ab");
  });

  it("skips when source and instruction are unchanged", async () => {
    const { calls, scheduler } = makeHarness();
    scheduler.schedule("same", CLEAN, "d1");
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    calls[0]?.deferred.resolve("refined");
    await flush();
    scheduler.schedule("same", CLEAN, "d1");
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    expect(calls).toHaveLength(1);
  });

  it("re-refines the same source under a different instruction", async () => {
    const { calls, scheduler } = makeHarness();
    scheduler.schedule("same", CLEAN, "d1");
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    calls[0]?.deferred.resolve("refined");
    await flush();
    scheduler.schedule("same", STRUCTURE, "d1");
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.instruction.id).toBe("structure");
  });

  it("refreshNow bypasses both the debounce and the unchanged skip", async () => {
    const { calls, scheduler } = makeHarness();
    scheduler.schedule("same", CLEAN, "d1");
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    calls[0]?.deferred.resolve("refined");
    await flush();
    scheduler.refreshNow("same", CLEAN, "d1");
    expect(calls).toHaveLength(2);
  });

  it("clears immediately on blank source without a request", () => {
    const { states, calls, scheduler } = makeHarness();
    scheduler.schedule("   \n ", CLEAN, "d1");
    expect(states.at(-1)).toEqual({ text: "", phase: "idle" });
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    expect(calls).toHaveLength(0);
  });

  it("aborts the in-flight request when a new one starts", () => {
    const { calls, scheduler } = makeHarness();
    scheduler.refreshNow("one", CLEAN, "d1");
    scheduler.refreshNow("two", CLEAN, "d1");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.signal.aborted).toBe(true);
    expect(calls[1]?.signal.aborted).toBe(false);
  });

  it("keeps the latest result on out-of-order resolves", async () => {
    const { states, calls, scheduler } = makeHarness();
    scheduler.refreshNow("one", CLEAN, "d1");
    scheduler.refreshNow("two", CLEAN, "d1");
    calls[1]?.deferred.resolve("second");
    await flush();
    calls[0]?.deferred.resolve("first");
    await flush();
    expect(states.at(-1)).toEqual({ text: "second", phase: "ready" });
  });

  it("drops a resolve that lands after reset, even for the same draft", async () => {
    const { states, calls, scheduler } = makeHarness();
    scheduler.refreshNow("one", CLEAN, "d1");
    scheduler.reset("d1");
    calls[0]?.deferred.resolve("stale");
    await flush();
    expect(states.at(-1)).toEqual({ text: "", phase: "idle" });
  });

  it("drops a resolve that lands after a draft switch", async () => {
    const { states, calls, scheduler } = makeHarness();
    scheduler.refreshNow("one", CLEAN, "d1");
    scheduler.reset("d2");
    calls[0]?.deferred.resolve("stale");
    await flush();
    expect(states.at(-1)).toEqual({ text: "", phase: "idle" });
  });

  it("reset clears the unchanged-skip cache so the same source re-refines", async () => {
    const { calls, scheduler } = makeHarness();
    scheduler.schedule("same", CLEAN, "d1");
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    calls[0]?.deferred.resolve("refined");
    await flush();
    scheduler.reset("d1");
    scheduler.schedule("same", CLEAN, "d1");
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    expect(calls).toHaveLength(2);
  });

  it("a blank clear also drops the unchanged-skip cache", async () => {
    const { calls, scheduler } = makeHarness();
    scheduler.schedule("same", CLEAN, "d1");
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    calls[0]?.deferred.resolve("refined");
    await flush();
    scheduler.schedule("", CLEAN, "d1");
    scheduler.schedule("same", CLEAN, "d1");
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    expect(calls).toHaveLength(2);
  });

  it("normalizes structure output before storing", async () => {
    const { states, calls, scheduler } = makeHarness();
    scheduler.refreshNow("draft", STRUCTURE, "d1");
    calls[0]?.deferred.resolve("# Title\n- a");
    await flush();
    expect(states.at(-1)).toEqual({ text: "**Title**\n- a", phase: "ready" });
  });

  it("does not normalize clean output", async () => {
    const { states, calls, scheduler } = makeHarness();
    scheduler.refreshNow("draft", CLEAN, "d1");
    calls[0]?.deferred.resolve("# Title");
    await flush();
    expect(states.at(-1)).toEqual({ text: "# Title", phase: "ready" });
  });

  it("maps missing-config errors to the connect message", async () => {
    const { states, calls, scheduler } = makeHarness();
    scheduler.refreshNow("draft", CLEAN, "d1");
    const error = new Error("No API key configured");
    error.name = "MissingApiKeyError";
    calls[0]?.deferred.reject(error);
    await flush();
    expect(states.at(-1)).toEqual({
      text: "",
      phase: "error",
      errorMessage: "Connect a model in Settings",
    });
  });

  it("keeps the previous result text alongside other errors", async () => {
    const { states, calls, scheduler } = makeHarness();
    scheduler.refreshNow("draft", CLEAN, "d1");
    calls[0]?.deferred.resolve("refined");
    await flush();
    scheduler.refreshNow("draft two", CLEAN, "d1");
    calls[1]?.deferred.reject(new Error("boom"));
    await flush();
    expect(states.at(-1)).toEqual({ text: "refined", phase: "error", errorMessage: "boom" });
    vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    expect(calls).toHaveLength(2);
  });
});

describe("previewCopyText", () => {
  const source = "raw source";

  it("copies a ready preview", () => {
    expect(previewCopyText({ text: "refined", phase: "ready" }, source)).toBe("refined");
  });

  it("copies the previous result while refreshing", () => {
    expect(previewCopyText({ text: "refined", phase: "refreshing" }, source)).toBe("refined");
  });

  it("falls back to source while refreshing with no prior result", () => {
    expect(previewCopyText({ text: "", phase: "refreshing" }, source)).toBe(source);
  });

  it("falls back to source on error and idle", () => {
    expect(
      previewCopyText({ text: "refined", phase: "error", errorMessage: "boom" }, source),
    ).toBe(source);
    expect(previewCopyText({ text: "", phase: "idle" }, source)).toBe(source);
  });
});
