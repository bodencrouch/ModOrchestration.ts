import type { FastifyInstance } from "fastify";
import type { AppState } from "../state.js";
import { queryString } from "./util.js";

export function registerLogRoutes(app: FastifyInstance, state: AppState): void {
  /** Lines with a sequence number greater than `since`; `x-log-last-seq` carries the newest seq. */
  app.get("/api/logs", async (req, reply) => {
    const raw = queryString(req.query, "since");
    const since = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : 0;
    const entries = state.logs.since(since);
    reply.header("x-log-last-seq", String(state.logs.lastSeq));
    reply.header("x-log-first-seq", String(state.logs.firstSeq));
    return entries.map((e) => e.item);
  });
}
