#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { deliver } from "./delivery.ts";
import { formatSnippets, preview, sanitize } from "./format.ts";
import { notify } from "./herdr.ts";
import { addSnippet, archiveSnippets, clearQueue, queueKey, readQueue, removeLastSnippet } from "./store.ts";

/** The subset of HERDR_PLUGIN_CONTEXT_JSON this plugin reads. */
type InvocationContext = {
  selected_text?: string | null;
  focused_pane_id?: string | null;
  focused_pane_cwd?: string | null;
  workspace_label?: string | null;
  tab_id?: string | null;
  tab_label?: string | null;
};

function invocationContext(): InvocationContext {
  try {
    return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function required(value: string | null | undefined, name: string): string {
  if (!value) throw new Error(`${name} is missing; run this action from a herdr keybinding`);
  return value;
}

function annotations(count: number): string {
  return count === 1 ? "1 annotation" : `${count} annotations`;
}

async function mark(context: InvocationContext, stateDir: string, queue: string): Promise<void> {
  const text = sanitize(context.selected_text ?? "");
  if (text === "") {
    await notify("Nothing selected", "Select text in copy mode, then press prefix+a");
    return;
  }
  const { added, count } = addSnippet(stateDir, queue, {
    id: randomUUID(),
    text,
    capturedAt: new Date().toISOString(),
    paneId: context.focused_pane_id ?? undefined,
    cwd: context.focused_pane_cwd ?? undefined,
    workspaceLabel: context.workspace_label ?? undefined,
    tabLabel: context.tab_label ?? undefined,
  });
  if (added) {
    await notify(`Annotation #${count} queued`, preview(text));
  } else {
    await notify("Already queued", `#${count}: ${preview(text)}`);
  }
}

async function insert(context: InvocationContext, stateDir: string, queue: string): Promise<void> {
  const snippets = readQueue(stateDir, queue);
  if (snippets.length === 0) {
    await notify("No annotations queued", "Select text in copy mode, then press prefix+a");
    return;
  }
  const paneId = required(context.focused_pane_id ?? process.env.HERDR_PANE_ID, "focused pane");
  if ((await deliver(paneId, formatSnippets(snippets))) === "agent-blocked") {
    await notify("Not inserted", "The agent is waiting for an approval or answer");
    return;
  }
  archiveSnippets(stateDir, queue, snippets, paneId);
  await notify(`${annotations(snippets.length)} inserted`);
}

async function undo(stateDir: string, queue: string): Promise<void> {
  const { removed, count } = removeLastSnippet(stateDir, queue);
  if (!removed) {
    await notify("No annotations queued");
    return;
  }
  await notify(`Removed #${count + 1} (${count} left)`, preview(removed.text));
}

async function clear(stateDir: string, queue: string): Promise<void> {
  const count = clearQueue(stateDir, queue);
  await notify(count === 0 ? "No annotations queued" : `${annotations(count)} discarded`);
}

async function main(command: string | undefined): Promise<void> {
  const context = invocationContext();
  const stateDir = required(process.env.HERDR_PLUGIN_STATE_DIR, "HERDR_PLUGIN_STATE_DIR");
  const socketPath = required(process.env.HERDR_SOCKET_PATH, "HERDR_SOCKET_PATH");
  const queue = queueKey(socketPath, required(context.tab_id ?? process.env.HERDR_TAB_ID, "tab id"));

  switch (command) {
    case "mark":
      return mark(context, stateDir, queue);
    case "insert":
      return insert(context, stateDir, queue);
    case "undo":
      return undo(stateDir, queue);
    case "clear":
      return clear(stateDir, queue);
    default:
      throw new Error(`unknown command: ${command ?? "(none)"}; expected mark | insert | undo | clear`);
  }
}

main(process.argv[2]).catch(async (error: Error) => {
  console.error(error.stack ?? error.message);
  await notify("Quick Annotate failed", error.message);
  process.exitCode = 1;
});
