import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createDefaultSettings } from "../model/defaults.js";
import type { UserSettings } from "../model/types.js";

/** Environment variable that overrides the settings file location. */
export const SETTINGS_PATH_ENV = "MODSYNC_SETTINGS_PATH";

export class SettingsError extends Error {
  constructor(
    message: string,
    readonly path: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SettingsError";
  }
}

/**
 * Platform default: `%APPDATA%/ModSync/settings.json` on Windows, otherwise
 * `$XDG_CONFIG_HOME/modsync/settings.json` (falling back to `~/.config`).
 * `MODSYNC_SETTINGS_PATH` wins when set.
 */
export function defaultSettingsPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const override = env[SETTINGS_PATH_ENV];
  if (override && override.trim()) return override;
  if (platform === "win32") {
    const appData = env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appData, "ModSync", "settings.json");
  }
  const configHome = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "modsync", "settings.json");
}

/** Keys accepted from the JSON file; anything else is dropped on load. */
const SETTINGS_KEYS = new Set<keyof UserSettings>(Object.keys(createDefaultSettings()) as (keyof UserSettings)[]);
for (const optional of [
  "holoPatcherPath",
  "tslPatcherPath",
  "sevenZipPath",
  "nexusApiKey",
  "checkpointDirectory",
] as const) {
  SETTINGS_KEYS.add(optional);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Merge a parsed JSON object over the defaults, ignoring unknown keys and
 * `null`/`undefined` values so that a partially written file never removes a
 * default.
 */
export function mergeSettings(raw: unknown): UserSettings {
  const partial: Partial<UserSettings> = {};
  if (isRecord(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (!SETTINGS_KEYS.has(k as keyof UserSettings)) continue;
      if (v === null || v === undefined) continue;
      (partial as Record<string, unknown>)[k] = v;
    }
  }
  return createDefaultSettings(partial);
}

/**
 * Load settings from `path` (default: `defaultSettingsPath()`). A missing file
 * yields the defaults; a malformed file throws `SettingsError`.
 */
export async function loadSettings(path?: string): Promise<UserSettings> {
  const file = path ?? defaultSettingsPath();
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return createDefaultSettings();
    throw new SettingsError(`Cannot read settings file ${file}`, file, err);
  }
  if (!text.trim()) return createDefaultSettings();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new SettingsError(`Settings file ${file} is not valid JSON`, file, err);
  }
  return mergeSettings(parsed);
}

/** Write settings as pretty JSON, atomically (temp file + rename). */
export async function saveSettings(settings: UserSettings, path?: string): Promise<string> {
  const file = path ?? defaultSettingsPath();
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const text = JSON.stringify(settings, null, 2) + "\n";
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, file);
  } catch (err) {
    throw new SettingsError(`Cannot write settings file ${file}`, file, err);
  }
  return file;
}
