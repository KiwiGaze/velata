/** A half-open range of matched characters within a string; `end` is exclusive. */
export interface HighlightRange {
  start: number;
  end: number;
}

/** A snippet of draft body text plus the ranges to highlight inside it. */
export interface SnippetMatch {
  text: string;
  ranges: HighlightRange[];
}

/** Where a query matched a draft: highlight ranges in its title and a body snippet. */
export interface DraftMatch {
  titleRanges: HighlightRange[];
  snippet: SnippetMatch | null;
}

/** A draft paired with its match, or `null` match when no query is active. */
export interface DraftSearchResult<T> {
  draft: T;
  match: DraftMatch | null;
}

const SNIPPET_CONTEXT_BEFORE = 24;
const SNIPPET_LENGTH = 96;

/** The first line with non-whitespace content, trimmed, or `null` when there is none. */
export function firstNonEmptyLine(text: string): string | null {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

/** All case-insensitive, non-overlapping ranges where `query` occurs in `text`. */
export function findMatchRanges(text: string, query: string): HighlightRange[] {
  if (query.length === 0) {
    return [];
  }
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const ranges: HighlightRange[] = [];
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) {
      break;
    }
    ranges.push({ start: index, end: index + needle.length });
    from = index + needle.length;
  }
  return ranges;
}

/** Match `text` against a trimmed `query`, returning title ranges and a body snippet, or `null`. */
export function matchDraft(text: string, query: string): DraftMatch | null {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return null;
  }
  const firstIndex = text.toLowerCase().indexOf(trimmedQuery.toLowerCase());
  if (firstIndex === -1) {
    return null;
  }

  const title = firstNonEmptyLine(text) ?? "";
  const titleRanges = findMatchRanges(title, trimmedQuery);

  const windowStart = Math.max(0, firstIndex - SNIPPET_CONTEXT_BEFORE);
  const windowEnd = Math.min(text.length, windowStart + SNIPPET_LENGTH);
  let snippetText = text.slice(windowStart, windowEnd).replace(/\s+/g, " ");
  if (windowStart > 0) {
    snippetText = `…${snippetText}`;
  }
  if (windowEnd < text.length) {
    snippetText = `${snippetText}…`;
  }

  // A snippet identical to the title would render the same line twice in DraftRow.
  const snippet =
    snippetText === title
      ? null
      : { text: snippetText, ranges: findMatchRanges(snippetText, trimmedQuery) };

  return { titleRanges, snippet };
}

/** Filter and annotate drafts by `query`; an empty query yields every draft with a `null` match. */
export function searchDrafts<T extends { text: string }>(
  drafts: readonly T[],
  query: string,
): DraftSearchResult<T>[] {
  if (query.trim().length === 0) {
    return drafts.map((draft) => ({ draft, match: null }));
  }
  const results: DraftSearchResult<T>[] = [];
  for (const draft of drafts) {
    const match = matchDraft(draft.text, query);
    if (match !== null) {
      results.push({ draft, match });
    }
  }
  return results;
}
