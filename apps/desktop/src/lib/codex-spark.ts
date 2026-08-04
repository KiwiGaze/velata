import { invoke } from "@tauri-apps/api/core";
import {
  buildCodexTaskPrompt,
  type ConnectionResult,
  DEFAULT_INSTRUCTION,
  type Instruction,
} from "@velata/core";

import { CodexSparkError, normalizeCodexSparkError } from "@/lib/refine-errors";

interface RefineResponse {
  readonly text: string;
}

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function isSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function readRefineResponse(response: unknown): RefineResponse {
  if (typeof response !== "object" || response === null || !Object.hasOwn(response, "text")) {
    throw new CodexSparkError("execution-failed");
  }
  const text = (response as Readonly<Record<string, unknown>>)["text"];
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new CodexSparkError("execution-failed");
  }
  return { text };
}

async function cancelCodexSpark(requestId: string): Promise<void> {
  try {
    await invoke("cancel_codex_spark", { request: { requestId } });
  } catch {
    return;
  }
}

async function waitForCancellation(cancellation: Promise<void> | undefined): Promise<void> {
  if (cancellation === undefined) {
    return;
  }
  await cancellation;
}

/** Refines raw input through the local Codex Spark command without an HTTP fallback. */
export async function refineWithCodexSpark(
  instruction: Instruction,
  input: string,
  signal?: AbortSignal,
): Promise<string> {
  if (isSignalAborted(signal)) {
    throw createAbortError();
  }

  const requestId = crypto.randomUUID();
  let cancellation: Promise<void> | undefined;
  const handleAbort = (): void => {
    cancellation = cancelCodexSpark(requestId);
  };
  signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    const response = await invoke<unknown>("refine_with_codex_spark", {
      request: {
        requestId,
        taskPrompt: buildCodexTaskPrompt(instruction),
        input,
      },
    });
    if (isSignalAborted(signal)) {
      await waitForCancellation(cancellation);
      throw createAbortError();
    }
    return readRefineResponse(response).text;
  } catch (error) {
    if (isSignalAborted(signal)) {
      await waitForCancellation(cancellation);
      throw createAbortError();
    }
    throw normalizeCodexSparkError(error);
  } finally {
    signal?.removeEventListener("abort", handleAbort);
  }
}

/** Tests Codex Spark availability through the same local process boundary. */
export async function testCodexSparkConnection(signal?: AbortSignal): Promise<ConnectionResult> {
  try {
    await refineWithCodexSpark(DEFAULT_INSTRUCTION, "ping", signal);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.length > 0 ? error.message : "Refine failed.";
    return { ok: false, error: message };
  }
}
