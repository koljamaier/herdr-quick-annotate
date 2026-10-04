import { agentInfo, paste, readVisible } from "./herdr.ts";

/** Footer hint Claude Code shows while a multi-line paste is collapsed to "[Pasted text #N +M lines]". */
const CLAUDE_COLLAPSED_PASTE_HINT = "paste again to expand";
const EXPAND_POLL_MS = 50;
const EXPAND_POLL_ATTEMPTS = 20;

export type Delivery = "pasted" | "agent-blocked";

/**
 * Pastes text into the pane's prompt without submitting it. Claude Code collapses multi-line
 * pastes into a placeholder, which hides the A1/A2 labels needed for dictating comments; pasting
 * the identical text a second time expands it in place, so that happens once the hint shows up.
 */
export async function deliver(paneId: string, text: string): Promise<Delivery> {
  const agent = await agentInfo(paneId);
  if (agent?.status === "blocked") return "agent-blocked";

  await paste(paneId, text);
  if (agent?.kind === "claude" && (await waitForCollapsedPaste(paneId))) {
    await paste(paneId, text);
  }
  return "pasted";
}

async function waitForCollapsedPaste(paneId: string): Promise<boolean> {
  for (let attempt = 0; attempt < EXPAND_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, EXPAND_POLL_MS));
    if ((await readVisible(paneId)).includes(CLAUDE_COLLAPSED_PASTE_HINT)) return true;
  }
  return false;
}
