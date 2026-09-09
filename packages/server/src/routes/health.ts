import type { FastifyInstance } from "fastify";
import type { AppState } from "../state.js";
import { SERVER_VERSION } from "../types.js";

export function registerHealthRoutes(app: FastifyInstance, state: AppState): void {
  app.get("/api/health", async () => ({
    ok: true,
    version: SERVER_VERSION,
    platform: process.platform,
    isElectron: Boolean(state.electronBridge),
    fileLoaded: state.file !== null,
    installRunning: state.installRunning,
  }));
}
