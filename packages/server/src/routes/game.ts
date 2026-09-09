import { resolve as resolvePath } from "node:path";
import type { FastifyInstance } from "fastify";
import { RealFileSystem, detectGame } from "@modsync/core";
import { HttpError, type AppState } from "../state.js";
import { queryString } from "./util.js";

export function registerGameRoutes(app: FastifyInstance, state: AppState): void {
  app.get("/api/game/detect", async (req) => {
    const path = queryString(req.query, "path")?.trim() || state.settings.kotorDirectory;
    if (!path) throw new HttpError(400, "path query parameter is required");
    return detectGame(resolvePath(path), new RealFileSystem());
  });
}
