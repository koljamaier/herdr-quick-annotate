import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import {
  addSnippet,
  archiveSnippets,
  clearQueue,
  historyPath,
  queuePath,
  readQueue,
  removeLastSnippet,
  withLock,
  type Snippet,
} from "../src/store.ts";

let stateDir: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "quick-annotate-test-"));
});

function snippet(text: string): Snippet {
  return { id: `id-${text}`, text, capturedAt: "2026-10-04T00:00:00.000Z" };
}

test("each tab has its own queue", () => {
  addSnippet(stateDir, "w1:t1", snippet("one"));
  addSnippet(stateDir, "w1:t1", snippet("two"));
  addSnippet(stateDir, "w1:t2", snippet("other tab"));

  assert.deepEqual(readQueue(stateDir, "w1:t1").map((s) => s.text), ["one", "two"]);
  assert.deepEqual(readQueue(stateDir, "w1:t2").map((s) => s.text), ["other tab"]);
  assert.ok(queuePath(stateDir, "w1:t1").endsWith("w1%3At1.jsonl"));
});

test("addSnippet counts and ignores an immediate duplicate", () => {
  assert.deepEqual(addSnippet(stateDir, "t", snippet("a")), { added: true, count: 1 });
  assert.deepEqual(addSnippet(stateDir, "t", { ...snippet("a"), id: "again" }), { added: false, count: 1 });
  assert.deepEqual(addSnippet(stateDir, "t", snippet("b")), { added: true, count: 2 });
});

test("removeLastSnippet pops the newest snippet", () => {
  addSnippet(stateDir, "t", snippet("a"));
  addSnippet(stateDir, "t", snippet("b"));

  assert.equal(removeLastSnippet(stateDir, "t").removed?.text, "b");
  assert.equal(removeLastSnippet(stateDir, "t").count, 0);
  assert.deepEqual(removeLastSnippet(stateDir, "t"), { removed: undefined, count: 0 });
  assert.equal(existsSync(queuePath(stateDir, "t")), false);
});

test("clearQueue empties only the given tab", () => {
  addSnippet(stateDir, "t1", snippet("a"));
  addSnippet(stateDir, "t1", snippet("b"));
  addSnippet(stateDir, "t2", snippet("c"));

  assert.equal(clearQueue(stateDir, "t1"), 2);
  assert.deepEqual(readQueue(stateDir, "t1"), []);
  assert.equal(readQueue(stateDir, "t2").length, 1);
});

test("archiveSnippets moves delivered snippets to history and keeps late ones queued", () => {
  addSnippet(stateDir, "t", snippet("a"));
  addSnippet(stateDir, "t", snippet("b"));
  const delivered = readQueue(stateDir, "t");
  addSnippet(stateDir, "t", snippet("late"));

  archiveSnippets(stateDir, "t", delivered, "w1:p1");

  assert.deepEqual(readQueue(stateDir, "t").map((s) => s.text), ["late"]);
  const history = readFileSync(historyPath(stateDir), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(history.length, 1);
  assert.equal(history[0].targetPaneId, "w1:p1");
  assert.deepEqual(history[0].snippets.map((s: Snippet) => s.text), ["a", "b"]);
});

test("withLock takes over a stale lock", () => {
  const lock = join(stateDir, ".lock");
  mkdirSync(lock);
  const old = new Date(Date.now() - 60_000);
  utimesSync(lock, old, old);

  assert.equal(withLock(stateDir, () => "ran"), "ran");
  assert.equal(existsSync(lock), false);
});
