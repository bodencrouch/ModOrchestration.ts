import type { FastifyInstance } from "fastify";
import { COMPATIBILITY_LEVELS, PATCHER_ENGINES, PLATFORMS, type UserSettings } from "@modsync/core";
import { HttpError, type AppState } from "../state.js";
import { bodyOf } from "./util.js";

const STRING_KEYS: Array<keyof UserSettings> = [
  "modDirectory",
  "kotorDirectory",
  "holoPatcherPath",
  "tslPatcherPath",
  "sevenZipPath",
  "nexusApiKey",
  "checkpointDirectory",
];
const BOOL_KEYS: Array<keyof UserSettings> = ["spoilerFree", "createCheckpoints", "telemetryEnabled", "verboseLogging"];

/** Validate a settings patch; unknown keys are dropped, wrong types rejected. */
export function sanitizeSettingsPatch(raw: Record<string, unknown>): Partial<UserSettings> {
  const out: Record<string, unknown> = {};
  for (const key of STRING_KEYS) {
    if (raw[key] === undefined) continue;
    if (raw[key] === null) {
      out[key] = "";
      continue;
    }
    if (typeof raw[key] !== "string") throw new HttpError(400, `settings.${key} must be a string`);
    out[key] = raw[key];
  }
  for (const key of BOOL_KEYS) {
    if (raw[key] === undefined || raw[key] === null) continue;
    if (typeof raw[key] !== "boolean") throw new HttpError(400, `settings.${key} must be a boolean`);
    out[key] = raw[key];
  }
  if (raw.maxConcurrentDownloads !== undefined && raw.maxConcurrentDownloads !== null) {
    const n = Number(raw.maxConcurrentDownloads);
    if (!Number.isInteger(n) || n < 1 || n > 16) throw new HttpError(400, "settings.maxConcurrentDownloads must be an integer between 1 and 16");
    out.maxConcurrentDownloads = n;
  }
  const enumKey = (key: keyof UserSettings, allowed: readonly string[]): void => {
    const v = raw[key];
    if (v === undefined || v === null) return;
    if (typeof v !== "string" || !allowed.includes(v)) throw new HttpError(400, `settings.${key} must be one of ${allowed.join(", ")}`);
    out[key] = v;
  };
  enumKey("patcherEngine", PATCHER_ENGINES);
  enumKey("compatibilityLevel", COMPATIBILITY_LEVELS);
  enumKey("platform", PLATFORMS);
  enumKey("theme", ["dark", "light"]);
  return out as Partial<UserSettings>;
}

export function registerSettingsRoutes(app: FastifyInstance, state: AppState): void {
  app.get("/api/settings", async () => state.settings);

  app.put("/api/settings", async (req) => {
    const patch = sanitizeSettingsPatch(bodyOf(req.body));
    return state.updateSettings(patch);
  });
}
