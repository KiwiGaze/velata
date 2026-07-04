export type MarkdownMark = "bold" | "italic" | "code" | "link";

export type MarkdownLineKind = "plain" | "bullet" | "numbered" | "check" | "quote";

export interface MarkdownRun {
  text: string;
  sourceStart: number;
  sourceEnd: number;
  marks: MarkdownMark[];
  url: string | undefined;
}

export interface MarkdownLine {
  kind: MarkdownLineKind;
  marker: string;
  sourceStart: number;
  sourceEnd: number;
  contentSourceStart: number;
  visibleStart: number;
  visibleEnd: number;
  visibleText: string;
  runs: MarkdownRun[];
}

export interface FormattedMarkdown {
  source: string;
  sourceLength: number;
  visibleText: string;
  lines: MarkdownLine[];
}

interface InlineToken {
  run: MarkdownRun;
  end: number;
}

const CHECK_PREFIX = /^- \[[ xX]\] /;
const NUMBERED_PREFIX = /^\d+\. /;

function readBlockMarker(line: string): { kind: MarkdownLineKind; marker: string } {
  const check = CHECK_PREFIX.exec(line);
  if (check?.[0] !== undefined) {
    return { kind: "check", marker: check[0] };
  }
  const numbered = NUMBERED_PREFIX.exec(line);
  if (numbered?.[0] !== undefined) {
    return { kind: "numbered", marker: numbered[0] };
  }
  if (line.startsWith("- ")) {
    return { kind: "bullet", marker: "- " };
  }
  if (line.startsWith("> ")) {
    return { kind: "quote", marker: "> " };
  }
  return { kind: "plain", marker: "" };
}

function makeRun(
  line: string,
  sourceBase: number,
  start: number,
  end: number,
  marks: MarkdownMark[],
  url?: string,
): MarkdownRun {
  return {
    text: line.slice(start, end),
    sourceStart: sourceBase + start,
    sourceEnd: sourceBase + end,
    marks,
    url,
  };
}

function readToken(line: string, sourceBase: number, index: number): InlineToken | null {
  if (line.startsWith("***", index)) {
    const close = line.indexOf("***", index + 3);
    if (close !== -1) {
      return {
        run: makeRun(line, sourceBase, index + 3, close, ["bold", "italic"]),
        end: close + 3,
      };
    }
  }

  if (line.startsWith("**", index)) {
    const close = line.indexOf("**", index + 2);
    if (close !== -1) {
      return {
        run: makeRun(line, sourceBase, index + 2, close, ["bold"]),
        end: close + 2,
      };
    }
  }

  if (line[index] === "*" && line[index + 1] !== "*") {
    const close = line.indexOf("*", index + 1);
    if (close !== -1) {
      return {
        run: makeRun(line, sourceBase, index + 1, close, ["italic"]),
        end: close + 1,
      };
    }
  }

  if (line[index] === "`") {
    const close = line.indexOf("`", index + 1);
    if (close !== -1) {
      return {
        run: makeRun(line, sourceBase, index + 1, close, ["code"]),
        end: close + 1,
      };
    }
  }

  if (line[index] === "[") {
    const closeLabel = line.indexOf("](", index + 1);
    if (closeLabel !== -1) {
      const closeUrl = line.indexOf(")", closeLabel + 2);
      if (closeUrl !== -1) {
        return {
          run: makeRun(
            line,
            sourceBase,
            index + 1,
            closeLabel,
            ["link"],
            line.slice(closeLabel + 2, closeUrl),
          ),
          end: closeUrl + 1,
        };
      }
    }
  }

  return null;
}

function parseInline(line: string, sourceBase: number): MarkdownRun[] {
  const runs: MarkdownRun[] = [];
  let index = 0;

  while (index < line.length) {
    const token = readToken(line, sourceBase, index);
    if (token !== null) {
      runs.push(token.run);
      index = token.end;
      continue;
    }

    const start = index;
    index += 1;
    while (index < line.length && readToken(line, sourceBase, index) === null) {
      index += 1;
    }
    runs.push(makeRun(line, sourceBase, start, index, []));
  }

  return runs;
}

export function parseFormattedMarkdown(source: string): FormattedMarkdown {
  const sourceLines = source.split("\n");
  const lines: MarkdownLine[] = [];
  let sourceStart = 0;
  let visibleStart = 0;

  for (const line of sourceLines) {
    const { kind, marker } = readBlockMarker(line);
    const content = line.slice(marker.length);
    const contentSourceStart = sourceStart + marker.length;
    const runs = parseInline(content, contentSourceStart);
    const visibleText = runs.map((run) => run.text).join("");
    const visibleEnd = visibleStart + visibleText.length;

    lines.push({
      kind,
      marker,
      sourceStart,
      sourceEnd: sourceStart + line.length,
      contentSourceStart,
      visibleStart,
      visibleEnd,
      visibleText,
      runs,
    });

    sourceStart += line.length + 1;
    visibleStart = visibleEnd + 1;
  }

  return {
    source,
    sourceLength: source.length,
    visibleText: lines.map((line) => line.visibleText).join("\n"),
    lines,
  };
}
