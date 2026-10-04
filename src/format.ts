import type { Snippet } from "./store.ts";

/**
 * Drops terminal control characters (ESC could end the bracketed paste early) and the
 * trailing padding copy mode adds to selected lines, plus blank lines around the selection.
 */
export function sanitize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

/** Single-line excerpt for the toast body. */
export function preview(text: string, maxLength = 60): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= maxLength ? line : `${line.slice(0, maxLength - 1)}…`;
}

/**
 * The text pasted into the agent prompt. Each snippet gets a short label (A1, A2, ...) so the
 * comments can be dictated afterwards ("Zu A1: ..."). Ends with a blank line for that dictation.
 */
export function formatSnippets(snippets: Snippet[]): string {
  const blocks = snippets.map((snippet, index) => {
    const quoted = snippet.text
      .split("\n")
      .map((line) => (line === "" ? ">" : `> ${line}`))
      .join("\n");
    return `[A${index + 1}]\n${quoted}`;
  });
  return `Anmerkungen zu folgenden Stellen:\n\n${blocks.join("\n\n")}\n\n`;
}
