import { invoke } from "@tauri-apps/api/core";
import {
  buildSystemPrompt,
  type ConnectionResult,
  DEFAULT_INSTRUCTION,
  type Instruction,
} from "@velata/core";

import { CodexSparkError, normalizeCodexSparkError } from "@/lib/refine-errors";

interface RefineResponse {
  readonly text: string;
}

const CODEX_DEVELOPER_INSTRUCTION_SUFFIX = `Process only the draft provided through stdin.
Do not use tools, run commands, read files, or use outside context.
Return only the final text. Do not include a preamble, quotation wrapper, explanation, reasoning, or source fence.
When formatting is needed, use only Velata-supported Markdown: paragraphs; headings where the selected instruction permits them; bold; italic; inline code; fenced code; blockquotes; bulleted lists; numbered lists; and links.
Use no tables, images, HTML, task-list syntax, or hard breaks.`;

function buildCodexDeveloperInstructions(instruction: Instruction): string {
  return `${buildSystemPrompt(instruction)}\n\n${CODEX_DEVELOPER_INSTRUCTION_SUFFIX}`;
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
        developerInstructions: buildCodexDeveloperInstructions(instruction),
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
