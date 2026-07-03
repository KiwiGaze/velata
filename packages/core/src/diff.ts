/** One span of a before/after comparison. */
export interface DiffToken {
  readonly type: "kept" | "added" | "removed";
  readonly text: string;
}

const TOKEN_PATTERN = /\s+|[\p{Script=Latin}\p{N}_]+(?:['’][\p{Script=Latin}\p{N}_]+)*|[\s\S]/gu;

/**
 * Splits text into diff tokens: whitespace runs, Latin/number words (keeping
 * internal apostrophes), and every other character on its own. CJK and
 * punctuation therefore compare one character at a time, since they carry no
 * whitespace word boundaries.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const [token] = match;
    tokens.push(token);
  }
  return tokens;
}

/**
 * Compares `before` and `after` at word granularity and returns the tokens of
 * both, each tagged `kept`, `added`, or `removed`. Uses a longest-common-
 * subsequence alignment, so the shared words stay `kept` and only the true
 * edits are marked. Concatenating every non-`added` token reproduces `before`;
 * concatenating every non-`removed` token reproduces `after`.
 */
export function diffWords(before: string, after: string): DiffToken[] {
  const source = tokenize(before);
  const target = tokenize(after);
  const rows = source.length;
  const cols = target.length;

  const lengths: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i--) {
    const current = lengths[i];
    const below = lengths[i + 1];
    if (current === undefined || below === undefined) {
      continue;
    }
    for (let j = cols - 1; j >= 0; j--) {
      current[j] =
        source[i] === target[j]
          ? (below[j + 1] ?? 0) + 1
          : Math.max(below[j] ?? 0, current[j + 1] ?? 0);
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    const left = source[i];
    const right = target[j];
    if (left === undefined || right === undefined) {
      break;
    }
    if (left === right) {
      tokens.push({ type: "kept", text: left });
      i += 1;
      j += 1;
    } else if ((lengths[i + 1]?.[j] ?? 0) >= (lengths[i]?.[j + 1] ?? 0)) {
      tokens.push({ type: "removed", text: left });
      i += 1;
    } else {
      tokens.push({ type: "added", text: right });
      j += 1;
    }
  }
  for (; i < rows; i += 1) {
    const left = source[i];
    if (left !== undefined) {
      tokens.push({ type: "removed", text: left });
    }
  }
  for (; j < cols; j += 1) {
    const right = target[j];
    if (right !== undefined) {
      tokens.push({ type: "added", text: right });
    }
  }
  return tokens;
}

/** True when the token is a whitespace run, which callers render without marks. */
export function isWhitespaceToken(token: DiffToken): boolean {
  return token.text.trim().length === 0;
}
