#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { deliver } from "./delivery.ts";
import { formatSnippets, preview, sanitize } from "./format.ts";
import { notify } from "./herdr.ts";
import { addSnippet, archiveSnippets, clearQueue, readQueue, removeLastSnippet } from "./store.ts";

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
  return count === 1 ? "1 Annotation" : `${count} Annotationen`;
}

async function mark(context: InvocationContext, stateDir: string, tabId: string): Promise<void> {
  const text = sanitize(context.selected_text ?? "");
  if (text === "") {
    await notify("Nichts markiert", "Im Copy-Mode Text auswählen, dann prefix+a");
    return;
  }
  const { added, count } = addSnippet(stateDir, tabId, {
    id: randomUUID(),
    text,
    capturedAt: new Date().toISOString(),
    paneId: context.focused_pane_id ?? undefined,
    cwd: context.focused_pane_cwd ?? undefined,
    workspaceLabel: context.workspace_label ?? undefined,
    tabLabel: context.tab_label ?? undefined,
  });
  if (added) {
    await notify(`Annotation #${count} vorgemerkt`, preview(text));
  } else {
    await notify("Schon vorgemerkt", `#${count}: ${preview(text)}`);
  }
}

async function insert(context: InvocationContext, stateDir: string, tabId: string): Promise<void> {
  const snippets = readQueue(stateDir, tabId);
  if (snippets.length === 0) {
    await notify("Keine Annotationen vorgemerkt", "Im Copy-Mode markieren, dann prefix+a");
    return;
  }
  const paneId = required(context.focused_pane_id ?? process.env.HERDR_PANE_ID, "focused pane");
  if ((await deliver(paneId, formatSnippets(snippets))) === "agent-blocked") {
    await notify("Nicht eingefügt", "Der Agent wartet auf eine Bestätigung");
    return;
  }
  archiveSnippets(stateDir, tabId, snippets, paneId);
  await notify(`${annotations(snippets.length)} eingefügt`);
}

async function undo(stateDir: string, tabId: string): Promise<void> {
  const { removed, count } = removeLastSnippet(stateDir, tabId);
  if (!removed) {
    await notify("Keine Annotationen vorgemerkt");
    return;
  }
  await notify(`#${count + 1} entfernt (noch ${count})`, preview(removed.text));
}

async function clear(stateDir: string, tabId: string): Promise<void> {
  const count = clearQueue(stateDir, tabId);
  await notify(count === 0 ? "Keine Annotationen vorgemerkt" : `${annotations(count)} verworfen`);
}

async function main(command: string | undefined): Promise<void> {
  const context = invocationContext();
  const stateDir = required(process.env.HERDR_PLUGIN_STATE_DIR, "HERDR_PLUGIN_STATE_DIR");
  const tabId = required(context.tab_id ?? process.env.HERDR_TAB_ID, "tab id");

  switch (command) {
    case "mark":
      return mark(context, stateDir, tabId);
    case "insert":
      return insert(context, stateDir, tabId);
    case "undo":
      return undo(stateDir, tabId);
    case "clear":
      return clear(stateDir, tabId);
    default:
      throw new Error(`unknown command: ${command ?? "(none)"}; expected mark | insert | undo | clear`);
  }
}

main(process.argv[2]).catch(async (error: Error) => {
  console.error(error.stack ?? error.message);
  await notify("Quick Annotate: Fehler", error.message);
  process.exitCode = 1;
});
