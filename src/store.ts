import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Snippet = {
  id: string;
  text: string;
  capturedAt: string;
  paneId?: string;
  cwd?: string;
  workspaceLabel?: string;
  tabLabel?: string;
};

const LOCK_TIMEOUT_MS = 3000;
const LOCK_STALE_MS = 10_000;
const LOCK_RETRY_MS = 20;

/**
 * Identifies a tab's queue. Named herdr sessions share the plugin state dir but number their tabs
 * independently ("w1:t1" exists in each), so the session's socket path is part of the key.
 */
export function queueKey(socketPath: string, tabId: string): string {
  const session = createHash("sha256").update(socketPath).digest("hex").slice(0, 8);
  return `${session}:${tabId}`;
}

/** Queue keys contain ":", so they are encoded to stay filesystem safe. */
export function queuePath(stateDir: string, key: string): string {
  return join(stateDir, "queues", `${encodeURIComponent(key)}.jsonl`);
}

export function historyPath(stateDir: string): string {
  return join(stateDir, "history.jsonl");
}

export function readQueue(stateDir: string, key: string): Snippet[] {
  let content: string;
  try {
    content = readFileSync(queuePath(stateDir, key), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Snippet);
}

function writeQueue(stateDir: string, key: string, snippets: Snippet[]): void {
  const path = queuePath(stateDir, key);
  if (snippets.length === 0) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, snippets.map((snippet) => `${JSON.stringify(snippet)}\n`).join(""), { mode: 0o600 });
  renameSync(temporary, path);
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** Serializes read-modify-write cycles: every keypress spawns its own process. */
export function withLock<T>(stateDir: string, action: () => T): T {
  mkdirSync(stateDir, { recursive: true });
  const lock = join(stateDir, ".lock");
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (isStale(lock)) {
        rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`state is locked: ${lock}`);
      sleep(LOCK_RETRY_MS);
    }
  }
  try {
    return action();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function isStale(lock: string): boolean {
  try {
    return Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS;
  } catch {
    return false;
  }
}

export type AddResult = { added: boolean; count: number };

/** Appends a snippet unless it repeats the most recent one (e.g. a double keypress). */
export function addSnippet(stateDir: string, key: string, snippet: Snippet): AddResult {
  return withLock(stateDir, () => {
    const queue = readQueue(stateDir, key);
    if (queue.at(-1)?.text === snippet.text) return { added: false, count: queue.length };
    queue.push(snippet);
    writeQueue(stateDir, key, queue);
    return { added: true, count: queue.length };
  });
}

export type RemoveResult = { removed: Snippet | undefined; count: number };

export function removeLastSnippet(stateDir: string, key: string): RemoveResult {
  return withLock(stateDir, () => {
    const queue = readQueue(stateDir, key);
    const removed = queue.pop();
    if (removed) writeQueue(stateDir, key, queue);
    return { removed, count: queue.length };
  });
}

/** Drops the whole queue and returns how many snippets it held. */
export function clearQueue(stateDir: string, key: string): number {
  return withLock(stateDir, () => {
    const count = readQueue(stateDir, key).length;
    writeQueue(stateDir, key, []);
    return count;
  });
}

/**
 * Moves the given snippets from the queue into the history after they were delivered.
 * Snippets marked while the delivery was in flight stay queued.
 */
export function archiveSnippets(stateDir: string, key: string, delivered: Snippet[], targetPaneId: string): void {
  const deliveredIds = new Set(delivered.map((snippet) => snippet.id));
  withLock(stateDir, () => {
    const remaining = readQueue(stateDir, key).filter((snippet) => !deliveredIds.has(snippet.id));
    writeQueue(stateDir, key, remaining);
    const entry = { insertedAt: new Date().toISOString(), queue: key, targetPaneId, snippets: delivered };
    appendFileSync(historyPath(stateDir), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  });
}
