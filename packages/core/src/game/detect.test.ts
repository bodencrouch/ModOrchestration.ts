import { describe, it, expect } from "vitest";
import { detectGame, listOverride } from "./detect.js";
import type { DirEntry, FileStat, FileSystemPort } from "../ports/filesystem.js";

function fakeFs(tree: Record<string, string[]>): FileSystemPort {
  const dirs = new Map(Object.entries(tree).map(([k, v]) => [k, v]));
  const port: FileSystemPort = {
    isVirtual: true,
    async exists(p) {
      return dirs.has(p);
    },
    async stat(p): Promise<FileStat | undefined> {
      return dirs.has(p) ? { path: p, isDirectory: true, size: 0, mtimeMs: 0 } : undefined;
    },
    async readDir(p): Promise<DirEntry[]> {
      const names = dirs.get(p);
      if (!names) throw new Error("ENOENT");
      return names.map((n) => ({ name: n, path: `${p}/${n}`, isDirectory: dirs.has(`${p}/${n}`) }));
    },
    async walk(p) {
      const out: string[] = [];
      const rec = (d: string) => {
        for (const n of dirs.get(d) ?? []) {
          const full = `${d}/${n}`;
          if (dirs.has(full)) rec(full);
          else out.push(full);
        }
      };
      rec(p);
      return out;
    },
    async readFile() {
      return new Uint8Array();
    },
    async writeFile() {},
    async mkdirp() {},
    async copyFile() {},
    async move() {},
    async remove() {},
    async resolveCase(p) {
      return p;
    },
    async sha1() {
      return "";
    },
  };
  return port;
}

describe("detectGame", () => {
  it("detects KOTOR1 by executable", async () => {
    const fs = fakeFs({ "/g": ["swkotor.exe", "chitin.key", "Override"], "/g/Override": ["a.tpc"] });
    const r = await detectGame("/g", fs);
    expect(r.game).toBe("KOTOR1");
    expect(r.executable).toBe("/g/swkotor.exe");
    expect(r.looksLikeKotor).toBe(true);
    expect(r.isAspyr).toBe(false);
  });
  it("detects KOTOR2 Aspyr layout", async () => {
    const fs = fakeFs({ "/g": ["swkotor2.exe", "steam_api.dll", "steamassets"], "/g/steamassets": [] });
    const r = await detectGame("/g", fs);
    expect(r.game).toBe("KOTOR2");
    expect(r.isAspyr).toBe(true);
  });
  it("returns Unknown for empty dirs and does not throw for missing dirs", async () => {
    const fs = fakeFs({ "/g": [] });
    expect((await detectGame("/g", fs)).game).toBe("Unknown");
    expect((await detectGame("/nope", fs)).looksLikeKotor).toBe(false);
  });
  it("lists override files lowercase", async () => {
    const fs = fakeFs({ "/g": ["Override"], "/g/Override": ["B.TPC", "a.tga", "sub"], "/g/Override/sub": ["x.mdl"] });
    expect(await listOverride("/g", fs)).toEqual(["a.tga", "b.tpc", "sub/x.mdl"]);
  });
});
