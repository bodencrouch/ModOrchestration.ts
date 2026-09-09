/**
 * WebSocket endpoint `/ws`.
 *
 * server -> client: `{ seq, event }` for every InstallEvent / DownloadEvent.
 * client -> server: `{ type: "replay", lastSeq }` to receive everything the
 * client missed (from the ring buffer), `{ type: "answer", answer }` to
 * answer an installer prompt. A ping is sent every 20 s; a socket that does
 * not answer two pings in a row is dropped.
 */
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { UserPromptAnswer } from "@modsync/core";
import type { AppState } from "./state.js";
import type { ClientMessage, EventEnvelope } from "./types.js";

export const HEARTBEAT_INTERVAL_MS = 20_000;

function isAnswer(v: unknown): v is UserPromptAnswer {
  return typeof v === "object" && v !== null && typeof (v as { promptId?: unknown }).promptId === "string";
}

export function handleConnection(socket: WebSocket, state: AppState): void {
  const send = (payload: unknown): void => {
    if (socket.readyState !== socket.OPEN) return;
    try {
      socket.send(JSON.stringify(payload));
    } catch (err) {
      state.logger.debug(`ws send failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const onEvent = (env: EventEnvelope): void => send(env);
  const unsubscribe = state.subscribe(onEvent);

  let alive = true;
  socket.on("pong", () => {
    alive = true;
  });
  const heartbeat = setInterval(() => {
    if (socket.readyState !== socket.OPEN) return;
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    try {
      socket.ping();
    } catch {
      /* closing */
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  socket.on("message", (raw: unknown) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      send({ seq: 0, event: { type: "log", level: "warn", message: "ws: message is not JSON" } });
      return;
    }
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "replay": {
        const lastSeq = typeof msg.lastSeq === "number" && Number.isFinite(msg.lastSeq) ? Math.max(0, msg.lastSeq) : 0;
        for (const env of state.replay(lastSeq)) send(env);
        // A pending prompt must reach a client that connected after the prompt event was buffered out.
        const prompt = state.pendingPrompt;
        if (prompt && lastSeq >= state.events.lastSeq) {
          send({ seq: state.events.lastSeq, event: { type: "prompt", prompt } });
        }
        break;
      }
      case "answer": {
        if (!isAnswer(msg.answer)) {
          send({ seq: 0, event: { type: "log", level: "warn", message: "ws: answer needs a promptId" } });
          return;
        }
        try {
          state.answerPrompt(msg.answer);
        } catch (err) {
          send({ seq: 0, event: { type: "log", level: "warn", message: `ws: ${err instanceof Error ? err.message : String(err)}` } });
        }
        break;
      }
      case "ping":
        send({ type: "pong" });
        break;
      default:
        break;
    }
  });

  const cleanup = (): void => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  socket.on("close", cleanup);
  socket.on("error", (err: Error) => {
    state.logger.debug(`ws error: ${err.message}`);
    cleanup();
  });
}

export function registerWebSocket(app: FastifyInstance, state: AppState): void {
  app.get("/ws", { websocket: true }, (socket) => {
    handleConnection(socket, state);
  });
}
