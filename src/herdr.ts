import { createConnection } from "node:net";

type Json = Record<string, unknown>;

const REQUEST_TIMEOUT_MS = 5000;

let requestCounter = 0;

/** One request/response round trip over the herdr socket (newline-delimited JSON). */
export function call(method: string, params: Json): Promise<Json> {
  const socketPath = process.env.HERDR_SOCKET_PATH;
  if (!socketPath) {
    return Promise.reject(new Error("HERDR_SOCKET_PATH is not set; run inside herdr"));
  }
  const request = { id: `quick-annotate:${process.pid}:${++requestCounter}`, method, params };

  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let buffer = "";
    socket.setEncoding("utf8");
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => {
      socket.destroy(new Error(`${method}: no response within ${REQUEST_TIMEOUT_MS} ms`));
    });
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("error", reject);
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      socket.end();
      try {
        const response = JSON.parse(buffer.slice(0, newline));
        if (response.error) {
          reject(new Error(`${method}: ${response.error.code}: ${response.error.message}`));
        } else {
          resolve(response.result ?? {});
        }
      } catch (error) {
        reject(error);
      }
    });
  });
}

/** Best-effort toast; a failed notification must never fail the action itself. */
export async function notify(title: string, body?: string): Promise<void> {
  try {
    await call("notification.show", { title, body: body ?? null, sound: "none" });
  } catch (error) {
    console.error(`notification failed: ${(error as Error).message}`);
  }
}

/**
 * Types text into a pane without Enter. herdr wraps it in bracketed-paste markers when the
 * pane's application enabled bracketed paste (Claude Code does), so newlines don't submit.
 */
export async function paste(paneId: string, text: string): Promise<void> {
  await call("pane.send_input", { pane_id: paneId, text });
}

export type AgentInfo = {
  /** e.g. "claude", "codex" */
  kind: string | null;
  /** "idle", "working", "blocked", "done" or "unknown" */
  status: string | null;
};

/** The agent running in a pane, or null when herdr detects none. */
export async function agentInfo(paneId: string): Promise<AgentInfo | null> {
  let result: Json;
  try {
    result = await call("agent.get", { target: paneId });
  } catch {
    return null;
  }
  const agent = (result.agent ?? {}) as Json;
  return {
    kind: typeof agent.agent === "string" ? agent.agent : null,
    status: typeof agent.agent_status === "string" ? agent.agent_status : null,
  };
}

/** The currently rendered viewport of a pane as plain text. */
export async function readVisible(paneId: string): Promise<string> {
  const result = await call("pane.read", { pane_id: paneId, source: "visible" });
  const read = (result.read ?? {}) as Json;
  return typeof read.text === "string" ? read.text : "";
}
