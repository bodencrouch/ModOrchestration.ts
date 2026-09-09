import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultSettings } from "../model/defaults.js";
import { defaultSettingsPath, loadSettings, saveSettings, mergeSettings, SettingsError } from "./settings.js";

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "modsync-settings-"));
}

describe("defaultSettingsPath", () => {
  it("honours MODSYNC_SETTINGS_PATH", () => {
    expect(defaultSettingsPath({ MODSYNC_SETTINGS_PATH: "/x/y.json" }, "linux")).toBe("/x/y.json");
  });
  it("uses XDG_CONFIG_HOME on linux and APPDATA on windows", () => {
    expect(defaultSettingsPath({ XDG_CONFIG_HOME: "/cfg" }, "linux")).toBe("/cfg/modsync/settings.json");
    expect(defaultSettingsPath({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, "win32")).toMatch(
      /ModSync[\\/]settings\.json$/,
    );
    expect(defaultSettingsPath({}, "linux")).toMatch(/\.config[\\/]modsync[\\/]settings\.json$/);
  });
});

describe("loadSettings / saveSettings", () => {
  it("returns defaults when the file is missing", async () => {
    const dir = await tmp();
    expect(await loadSettings(join(dir, "missing.json"))).toEqual(createDefaultSettings());
  });

  it("round-trips and merges over defaults", async () => {
    const dir = await tmp();
    const path = join(dir, "deep", "settings.json");
    await writeFile(
      join(dir, "partial.json"),
      JSON.stringify({ kotorDirectory: "/games/kotor", theme: "light", nexusApiKey: null, bogus: 1 }),
    );
    const loaded = await loadSettings(join(dir, "partial.json"));
    expect(loaded.kotorDirectory).toBe("/games/kotor");
    expect(loaded.theme).toBe("light");
    expect(loaded.maxConcurrentDownloads).toBe(3);
    expect(loaded.nexusApiKey).toBeUndefined();
    expect((loaded as unknown as Record<string, unknown>).bogus).toBeUndefined();

    const written = await saveSettings({ ...loaded, maxConcurrentDownloads: 7 }, path);
    expect(written).toBe(path);
    const text = await readFile(path, "utf8");
    expect(JSON.parse(text).maxConcurrentDownloads).toBe(7);
    expect(await loadSettings(path)).toEqual({ ...loaded, maxConcurrentDownloads: 7 });
  });

  it("uses the env override when no path is given", async () => {
    const dir = await tmp();
    const path = join(dir, "env.json");
    const prev = process.env.MODSYNC_SETTINGS_PATH;
    process.env.MODSYNC_SETTINGS_PATH = path;
    try {
      await saveSettings(createDefaultSettings({ modDirectory: "/mods" }));
      expect((await loadSettings()).modDirectory).toBe("/mods");
    } finally {
      if (prev === undefined) delete process.env.MODSYNC_SETTINGS_PATH;
      else process.env.MODSYNC_SETTINGS_PATH = prev;
    }
  });

  it("throws SettingsError on malformed JSON and treats empty files as defaults", async () => {
    const dir = await tmp();
    const bad = join(dir, "bad.json");
    await writeFile(bad, "{ not json");
    await expect(loadSettings(bad)).rejects.toBeInstanceOf(SettingsError);
    const empty = join(dir, "empty.json");
    await writeFile(empty, "  \n");
    expect(await loadSettings(empty)).toEqual(createDefaultSettings());
  });

  it("mergeSettings ignores non-objects", () => {
    expect(mergeSettings([1, 2])).toEqual(createDefaultSettings());
    expect(mergeSettings("x")).toEqual(createDefaultSettings());
  });
});
