import type { FastifyInstance } from "fastify";
import type { AppState } from "../state.js";
import { registerCheckpointRoutes } from "./checkpoints.js";
import { registerDialogRoutes } from "./dialog.js";
import { registerDownloadRoutes } from "./downloads.js";
import { registerFileRoutes } from "./file.js";
import { registerFsRoutes } from "./fs.js";
import { registerGameRoutes } from "./game.js";
import { registerHealthRoutes } from "./health.js";
import { registerInstallRoutes } from "./install.js";
import { registerLogRoutes } from "./logs.js";
import { registerModRoutes } from "./mods.js";
import { registerSettingsRoutes } from "./settings.js";

export function registerRoutes(app: FastifyInstance, state: AppState): void {
  registerHealthRoutes(app, state);
  registerSettingsRoutes(app, state);
  registerFsRoutes(app, state);
  registerGameRoutes(app, state);
  registerFileRoutes(app, state);
  registerModRoutes(app, state);
  registerInstallRoutes(app, state);
  registerDownloadRoutes(app, state);
  registerCheckpointRoutes(app, state);
  registerLogRoutes(app, state);
  registerDialogRoutes(app, state);
}

export { browseDirectory, listRoots } from "./fs.js";
export { parseDocument, normalizeInstructionFile } from "./file.js";
export { computeDownloadNeeds, expectedEntries } from "./downloads.js";
export { tiersUpTo } from "./mods.js";
export { sanitizeSettingsPatch } from "./settings.js";
