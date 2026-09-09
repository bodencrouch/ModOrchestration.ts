import { describe, expect, it } from "vitest";
import { Tlk, decodeCp1250, encodeCp1250, readTlk, writeTlk } from "./tlk.js";

describe("tlk", () => {
  it("round-trips an empty file", () => {
    const bytes = writeTlk(new Tlk(0));
    expect(bytes.length).toBe(20);
    const back = readTlk(bytes);
    expect(back.language).toBe(0);
    expect(back.entries).toEqual([]);
  });

  it("round-trips multiple entries with sounds", () => {
    const t = new Tlk(2);
    t.add("Hello");
    t.add("With sound", "n_bast_001", 1.25);
    t.add("");
    t.add("Ünïcödé €");
    const bytes = writeTlk(t);
    const dv = new DataView(bytes.buffer);
    expect(dv.getUint32(12, true)).toBe(4);
    expect(dv.getUint32(16, true)).toBe(20 + 40 * 4);
    expect(dv.getUint32(20, true)).toBe(1); // flags: text only
    expect(dv.getUint32(60, true)).toBe(7); // text | sound | length
    const back = readTlk(bytes);
    expect(back.language).toBe(2);
    expect(back.entries.map((e) => e.text)).toEqual(["Hello", "With sound", "", "Ünïcödé €"]);
    expect(back.entries[1]!.soundResRef).toBe("n_bast_001");
    expect(back.entries[1]!.soundLength).toBeCloseTo(1.25);
    expect(back.entries[0]!.soundResRef).toBe("");
    expect(back.entries[0]!.soundLength).toBeUndefined();
    expect(writeTlk(back)).toEqual(bytes);
  });

  it("add/replace maintain indices", () => {
    const t = new Tlk();
    expect(t.add("a")).toBe(0);
    expect(t.add("b")).toBe(1);
    t.replace(0, "c", "snd");
    expect(t.entries[0]).toEqual({ text: "c", soundResRef: "snd" });
    expect(() => t.replace(5, "x")).toThrow(/out of range/);
  });

  it("uses cp1250 for Polish", () => {
    const t = new Tlk(5);
    t.add("Zażółć gęślą jaźń");
    const bytes = writeTlk(t);
    expect(readTlk(bytes).entries[0]!.text).toBe("Zażółć gęślą jaźń");
    expect(Array.from(encodeCp1250("ł"))).toEqual([0xb3]);
    expect(decodeCp1250(Uint8Array.from([0xa5]))).toBe("Ą");
  });

  it("warns for unsupported code pages", () => {
    const warnings: string[] = [];
    const t = new Tlk(128);
    t.add("abc");
    const bytes = writeTlk(t, { warn: (m) => warnings.push(m) });
    readTlk(bytes, { warn: (m) => warnings.push(m) });
    expect(warnings).toHaveLength(2);
  });
});
