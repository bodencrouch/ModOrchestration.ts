/**
 * Native dialogs, available only when Electron handed us a bridge.
 */
import type { FastifyInstance } from "fastify";
import { HttpError, type AppState } from "../state.js";
import { bodyOf, isRecord, optionalString } from "./util.js";

export function registerDialogRoutes(app: FastifyInstance, state: AppState): void {
  const bridge = (): NonNullable<AppState["electronBridge"]> => {
    if (!state.electronBridge) throw new HttpError(404, "Native dialogs are only available inside the desktop app");
    return state.electronBridge;
  };

  app.post("/api/dialog/pick-directory", async (req) => {
    const body = bodyOf(req.body);
    const path = await bridge().pickDirectory({ title: optionalString(body, "title"), defaultPath: optionalString(body, "defaultPath") });
    return { path: path ?? null };
  });

  app.post("/api/dialog/pick-file", async (req) => {
    const body = bodyOf(req.body);
    const filters = Array.isArray(body.filters)
      ? body.filters.filter((f): f is { name: string; extensions: string[] } => isRecord(f) && typeof f.name === "string" && Array.isArray(f.extensions))
      : undefined;
    const path = await bridge().pickFile({ title: optionalString(body, "title"), defaultPath: optionalString(body, "defaultPath"), filters });
    return { path: path ?? null };
  });
}
