import { describe, expect, it } from "vitest";

import { type DiffToken, diffWords, isWhitespaceToken } from "./diff";

function join(tokens: DiffToken[], keep: (token: DiffToken) => boolean): string {
  return tokens
    .filter(keep)
    .map((token) => token.text)
    .join("");
}

function words(tokens: DiffToken[], type: DiffToken["type"]): string[] {
  return tokens
    .filter((token) => token.type === type && !isWhitespaceToken(token))
    .map((token) => token.text);
}

const RECONSTRUCTION_CASES = [
  ["", ""],
  ["Add a dark mode toggle to the settings page.", "Add a dark mode toggle to the settings page."],
  ["", "brand new text"],
  ["everything goes away", ""],
  [
    "i want to um actually can you explain me why this query is so slow, i think maybe is the index but not sure",
    "Can you explain why this query is so slow? I think it might be the index, but I'm not sure.",
  ],
  ["你好世界", "你好地球"],
] as const;

describe("diffWords", () => {
  it("reproduces before from non-added tokens and after from non-removed tokens", () => {
    for (const [before, after] of RECONSTRUCTION_CASES) {
      const tokens = diffWords(before, after);
      expect(join(tokens, (token) => token.type !== "added")).toBe(before);
      expect(join(tokens, (token) => token.type !== "removed")).toBe(after);
    }
  });

  it("marks identical text entirely kept", () => {
    const tokens = diffWords("Add a dark mode toggle.", "Add a dark mode toggle.");
    expect(tokens.every((token) => token.type === "kept")).toBe(true);
    expect(words(tokens, "added")).toEqual([]);
    expect(words(tokens, "removed")).toEqual([]);
  });

  it("marks appended text as added without touching the shared prefix", () => {
    const tokens = diffWords("open the door", "open the door slowly");
    expect(words(tokens, "removed")).toEqual([]);
    expect(words(tokens, "added")).toEqual(["slowly"]);
    expect(words(tokens, "kept")).toEqual(["open", "the", "door"]);
  });

  it("marks deleted text as removed", () => {
    const tokens = diffWords("open the heavy door", "open the door");
    expect(words(tokens, "added")).toEqual([]);
    expect(words(tokens, "removed")).toEqual(["heavy"]);
  });

  it("keeps shared words when a phrase is rewritten mid-sentence", () => {
    const before =
      "i want to um actually can you explain me why this query is so slow, i think maybe is the index but not sure";
    const after =
      "Can you explain why this query is so slow? I think it might be the index, but I'm not sure.";
    const tokens = diffWords(before, after);
    const kept = words(tokens, "kept");
    for (const shared of ["explain", "why", "query", "slow", "index"]) {
      expect(kept).toContain(shared);
    }
    expect(words(tokens, "removed")).toContain("um");
    expect(words(tokens, "added")).toContain("Can");
  });

  it("compares CJK one character at a time", () => {
    const tokens = diffWords("你好世界", "你好地球");
    expect(words(tokens, "kept")).toEqual(["你", "好"]);
    expect(words(tokens, "removed")).toEqual(["世", "界"]);
    expect(words(tokens, "added")).toEqual(["地", "球"]);
  });

  it("preserves code identifiers as single kept tokens", () => {
    const tokens = diffWords("call useAuth now", "call useAuth later");
    expect(words(tokens, "kept")).toContain("useAuth");
    expect(words(tokens, "removed")).toEqual(["now"]);
    expect(words(tokens, "added")).toEqual(["later"]);
  });
});
