import { type Instruction } from "./instruction";

/** A single OpenAI-compatible chat message. */
export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

const TARGET_TOKEN = "{target}";

const MATCH_INPUT_TARGET = "the same language as the input";

const DEFAULT_FIRST_SENTENCE = `You are a writing refiner. Rewrite the user's message as clean, natural,
idiomatic {target}, changing as little as possible while keeping the
original meaning.`;

const MATCH_INPUT_FIRST_SENTENCE =
  "You are a writing refiner. Rewrite the user's message as clean, natural, idiomatic writing in the same language as the input, changing as little as possible while keeping the original meaning.";

/**
 * Builds the final system prompt for an instruction.
 *
 * Substitutes `{target}` with the target language's display value. For
 * `match-input`, first swaps the default opening sentence for its
 * language-agnostic variant, then replaces any remaining `{target}` tokens.
 * The result never contains a literal `{target}`.
 */
export function buildSystemPrompt(instruction: Instruction): string {
  if (instruction.targetLanguage === "match-input") {
    return instruction.prompt
      .split(DEFAULT_FIRST_SENTENCE)
      .join(MATCH_INPUT_FIRST_SENTENCE)
      .split(TARGET_TOKEN)
      .join(MATCH_INPUT_TARGET);
  }
  return instruction.prompt.split(TARGET_TOKEN).join(instruction.targetLanguage);
}

/** Assembles the request messages: the built system prompt plus the raw input. */
export function buildMessages(instruction: Instruction, input: string): ChatMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(instruction) },
    { role: "user", content: input },
  ];
}
