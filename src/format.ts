import type { Snippet } from "./store.ts";

/**
 * Drops terminal control characters (ESC could end the bracketed paste early), the trailing
 * padding copy mode adds to selected lines, blank lines around the selection, and the
 * indentation all lines share (e.g. the gutter Claude Code puts in front of every reply line).
 */
export function sanitize(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, "")
    .split("\n");
  return dedent(lines).join("\n");
}

/**
 * A selection usually starts mid-line, after the indentation, so the first line only gives up as
 * much leading whitespace as it has; relative indentation (e.g. in code) is kept.
 */
function dedent(lines: string[]): string[] {
  const indents = lines
    .slice(1)
    .filter((line) => line !== "")
    .map((line) => line.length - line.trimStart().length);
  if (indents.length === 0) return lines;
  const common = Math.min(...indents);
  return lines.map((line) => line.slice(Math.min(common, line.length - line.trimStart().length)));
}

/** Single-line excerpt for the toast body. */
export function preview(text: string, maxLength = 60): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= maxLength ? line : `${line.slice(0, maxLength - 1)}…`;
}

/**
 * The text pasted into the agent prompt. Each snippet gets a short label (A1, A2, ...) so the
 * comments can be dictated afterwards ("A1: ..."). Ends with a blank line for that dictation.
 */
export function formatSnippets(snippets: Snippet[]): string {
  const blocks = snippets.map((snippet, index) => {
    const quoted = snippet.text
      .split("\n")
      .map((line) => (line === "" ? ">" : `> ${line}`))
      .join("\n");
    return `[A${index + 1}]\n${quoted}`;
  });
  return `Comments on the following passages:\n\n${blocks.join("\n\n")}\n\n`;
}
