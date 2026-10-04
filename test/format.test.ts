import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSnippets, preview, sanitize } from "../src/format.ts";
import type { Snippet } from "../src/store.ts";

function snippet(text: string): Snippet {
  return { id: text, text, capturedAt: "2026-10-04T00:00:00.000Z" };
}

test("sanitize strips control characters but keeps newlines and tabs", () => {
  assert.equal(sanitize("a\x1b[201~b\x07c\td"), "a[201~bc\td");
});

test("sanitize normalizes line endings and trims copy-mode padding", () => {
  assert.equal(sanitize("\n\nfirst   \r\nsecond\t \rthird\n\n"), "first\nsecond\nthird");
});

test("preview collapses whitespace and truncates", () => {
  assert.equal(preview("one\n  two"), "one two");
  assert.equal(preview("abcdefghij", 5), "abcd…");
});

test("formatSnippets labels and quotes each snippet and ends with a blank line", () => {
  const text = formatSnippets([snippet("first line\nsecond line"), snippet("other\n\nparagraph")]);
  assert.equal(
    text,
    [
      "Anmerkungen zu folgenden Stellen:",
      "",
      "[A1]",
      "> first line",
      "> second line",
      "",
      "[A2]",
      "> other",
      ">",
      "> paragraph",
      "",
      "",
    ].join("\n"),
  );
});
