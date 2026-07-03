import { describe, expect, it } from "vitest";

import {
  type DraftMatch,
  findMatchRanges,
  firstNonEmptyLine,
  matchDraft,
  searchDrafts,
} from "./draft-search";

function sliceRange(text: string, range: { start: number; end: number }): string {
  return text.slice(range.start, range.end);
}

describe("firstNonEmptyLine", () => {
  it("returns the first trimmed non-empty line", () => {
    expect(firstNonEmptyLine("\n\n  hello \nworld")).toBe("hello");
  });

  it("returns null when every line is blank", () => {
    expect(firstNonEmptyLine("   \n\t\n")).toBeNull();
    expect(firstNonEmptyLine("")).toBeNull();
  });
});

describe("findMatchRanges", () => {
  it("returns no ranges for an empty query", () => {
    expect(findMatchRanges("anything", "")).toEqual([]);
  });

  it("matches case-insensitively", () => {
    expect(findMatchRanges("Hello HELLO hello", "hello")).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ]);
  });

  it("finds non-overlapping occurrences: 'aa' in 'aaaa' matches exactly twice", () => {
    expect(findMatchRanges("aaaa", "aa")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });
});

describe("matchDraft", () => {
  it("returns null for an empty or whitespace query", () => {
    expect(matchDraft("some text", "")).toBeNull();
    expect(matchDraft("some text", "   ")).toBeNull();
  });

  it("returns null when the text does not contain the query", () => {
    expect(matchDraft("some text", "missing")).toBeNull();
  });

  it("collects multiple title ranges", () => {
    const match = matchDraft("foo and foo again", "foo");
    expect(match?.titleRanges).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ]);
  });

  it("builds a snippet with ellipsis on both sides and correct highlight offsets", () => {
    const text = `${"x".repeat(30)}keyword${"y".repeat(100)}`;
    const match = matchDraft(text, "keyword");
    expect(match).not.toBeNull();
    const snippet = match?.snippet;
    expect(snippet).not.toBeNull();
    expect(snippet?.text.startsWith("…")).toBe(true);
    expect(snippet?.text.endsWith("…")).toBe(true);
    expect(snippet?.ranges).toEqual([{ start: 25, end: 32 }]);
    if (snippet) {
      expect(sliceRange(snippet.text, { start: 25, end: 32 })).toBe("keyword");
    }
  });

  it("omits the leading ellipsis when the match is at the start of the text", () => {
    const text = `keyword${"y".repeat(200)}`;
    const snippet = matchDraft(text, "keyword")?.snippet;
    expect(snippet?.text.startsWith("…")).toBe(false);
    expect(snippet?.text.endsWith("…")).toBe(true);
    expect(snippet?.ranges).toEqual([{ start: 0, end: 7 }]);
  });

  it("normalizes newlines inside the snippet window and recomputes the ranges", () => {
    const snippet = matchDraft("aa   bb\nkeyword\ncc", "keyword")?.snippet;
    expect(snippet?.text).toBe("aa bb keyword cc");
    expect(snippet?.ranges).toEqual([{ start: 6, end: 13 }]);
  });

  it("matches a CJK query in mixed Chinese and English text", () => {
    const text = "关于 模型 model 的说明";
    const match = matchDraft(text, "模型");
    expect(match).not.toBeNull();
    expect(match?.titleRanges).toEqual([{ start: 3, end: 5 }]);
    expect(match?.snippet).toBeNull();
  });

  it("suppresses the snippet when it would just repeat the title", () => {
    const match = matchDraft("Buy milk", "milk");
    expect(match?.titleRanges).toEqual([{ start: 4, end: 8 }]);
    expect(match?.snippet).toBeNull();
  });

  it("returns an empty title range but a snippet when the match is only in the body", () => {
    const match = matchDraft("First line title\nthe body mentions keyword here", "keyword");
    expect(match).not.toBeNull();
    expect(match?.titleRanges).toEqual([]);
    const snippet = match?.snippet;
    expect(snippet).not.toBeNull();
    expect(snippet?.text).toContain("keyword");
    expect(snippet?.ranges.length).toBeGreaterThan(0);
    if (snippet) {
      const [range] = snippet.ranges;
      expect(range).toBeDefined();
      if (range) {
        expect(sliceRange(snippet.text, range)).toBe("keyword");
      }
    }
  });
});

describe("searchDrafts", () => {
  const drafts = [
    { id: "1", text: "has apple pie" },
    { id: "2", text: "has banana bread" },
    { id: "3", text: "APPLE crumble" },
  ] as const;

  it("returns every draft with a null match for an empty query", () => {
    const results = searchDrafts(drafts, "");
    expect(results.map((r) => r.draft.id)).toEqual(["1", "2", "3"]);
    expect(results.every((r) => r.match === null)).toBe(true);
  });

  it("returns every draft with a null match for a whitespace query", () => {
    const results = searchDrafts(drafts, "   ");
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.match === null)).toBe(true);
  });

  it("excludes non-matching drafts and keeps input order", () => {
    const results = searchDrafts(drafts, "apple");
    expect(results.map((r) => r.draft.id)).toEqual(["1", "3"]);
    expect(results.every((r) => r.match !== null)).toBe(true);
    const first: DraftMatch | null = results[0]?.match ?? null;
    expect(first?.titleRanges).toEqual([{ start: 4, end: 9 }]);
  });
});
