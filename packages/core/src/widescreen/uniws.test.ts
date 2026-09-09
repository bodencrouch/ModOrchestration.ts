import { describe, it, expect } from "vitest";
import {
  detectResolutions,
  findResolutionPair,
  hasResolutionTable,
  patchExecutableResolution,
  KOTOR_RESOLUTION_TABLE,
  WidescreenPatchError,
} from "./uniws.js";

function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** Build a fake exe: junk, the resolution table (unaligned), junk, a push-immediate pair. */
function fakeExe(extraPairs: Array<[number, number]> = []): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < 37; i++) bytes.push((i * 31) & 0xff); // 37 bytes => table is unaligned
  for (const [w, h] of KOTOR_RESOLUTION_TABLE) bytes.push(...u32(w), ...u32(h));
  for (let i = 0; i < 50; i++) bytes.push(0x90);
  bytes.push(0x68, ...u32(1600), 0x68, ...u32(1200)); // push imm32 pairs are NOT adjacent -> not matched
  for (const [w, h] of extraPairs) bytes.push(...u32(w), ...u32(h));
  return Uint8Array.from(bytes);
}

describe("detectResolutions", () => {
  it("finds every table entry at unaligned offsets in order", () => {
    const exe = fakeExe();
    const found = detectResolutions(exe);
    expect(found.map((m) => [m.width, m.height])).toEqual(KOTOR_RESOLUTION_TABLE.map((p) => [...p]));
    expect(found[0].offset).toBe(37);
    expect(found[4].offset).toBe(37 + 4 * 8);
    expect(hasResolutionTable(exe)).toBe(true);
    expect(hasResolutionTable(new Uint8Array(100))).toBe(false);
  });

  it("finds duplicated pairs and custom pairs", () => {
    const exe = fakeExe([[1600, 1200], [1920, 1080]]);
    expect(findResolutionPair(exe, 1600, 1200)).toHaveLength(2);
    expect(detectResolutions(exe, [[1920, 1080]])).toHaveLength(1);
    expect(findResolutionPair(new Uint8Array(4), 640, 480)).toEqual([]);
  });
});

describe("patchExecutableResolution", () => {
  it("replaces every 1600x1200 pair and leaves the input untouched", () => {
    const exe = fakeExe([[1600, 1200]]);
    const before = Uint8Array.from(exe);
    const { patched, offsets } = patchExecutableResolution(exe, "KOTOR1", 1920, 1080);
    expect(offsets).toEqual(findResolutionPair(before, 1600, 1200));
    expect(offsets).toHaveLength(2);
    expect(exe).toEqual(before);
    expect(findResolutionPair(patched, 1600, 1200)).toEqual([]);
    expect(findResolutionPair(patched, 1920, 1080)).toEqual(offsets);
    // other table entries survive
    expect(findResolutionPair(patched, 1024, 768)).toHaveLength(1);
    expect(patched.length).toBe(exe.length);
    // bytes outside the patched sites are identical
    for (let i = 0; i < exe.length; i++) {
      const inSite = offsets.some((o) => i >= o && i < o + 8);
      if (!inSite) expect(patched[i]).toBe(exe[i]);
    }
  });

  it("refuses when the pair is missing, already patched, or too frequent", () => {
    expect(() => patchExecutableResolution(new Uint8Array(64), "KOTOR2", 1920, 1080)).toThrow(WidescreenPatchError);
    try {
      patchExecutableResolution(new Uint8Array(64), "KOTOR2", 1920, 1080);
    } catch (e) {
      expect((e as WidescreenPatchError).code).toBe("not-found");
    }
    const already = patchExecutableResolution(fakeExe(), "KOTOR2", 2560, 1440).patched;
    try {
      patchExecutableResolution(already, "KOTOR2", 2560, 1440);
      expect.fail("should throw");
    } catch (e) {
      expect((e as WidescreenPatchError).code).toBe("already-patched");
    }
    const many = fakeExe([[1600, 1200], [1600, 1200], [1600, 1200], [1600, 1200]]);
    try {
      patchExecutableResolution(many, "KOTOR1", 1920, 1080);
      expect.fail("should throw");
    } catch (e) {
      expect((e as WidescreenPatchError).code).toBe("too-many");
    }
  });

  it("validates resolution and game", () => {
    expect(() => patchExecutableResolution(fakeExe(), "KOTOR1", 0, 1080)).toThrow(/Unsupported resolution/);
    expect(() => patchExecutableResolution(fakeExe(), "KOTOR1", 1920.5, 1080)).toThrow(WidescreenPatchError);
    expect(() => patchExecutableResolution(fakeExe(), "Unknown", 1920, 1080)).toThrow(/Unknown/);
  });
});
