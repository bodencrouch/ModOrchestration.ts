import { describe, expect, it } from "vitest";
import { Encapsulated, encapsulatedFileTypeFromPath, isEncapsulatedPath, readEncapsulated, readErf, readRim, writeEncapsulated, writeErf, writeRim } from "./erf.js";
import { ResourceTypes } from "./restypes.js";

function sample(type: "MOD " | "RIM "): Encapsulated {
  const e = new Encapsulated(type);
  e.set("p_test", ResourceTypes.utc, Uint8Array.from([1, 2, 3]));
  e.set("area", ResourceTypes.are, new Uint8Array(0));
  e.set("sixteencharacter", ResourceTypes.ncs, Uint8Array.from([9]));
  return e;
}

describe("erf/rim", () => {
  it("round-trips ERF/MOD", () => {
    const e = sample("MOD ");
    const bytes = writeErf(e, { buildYear: 124, buildDay: 10 });
    expect(bytes.length).toBe(160 + 24 * 3 + 8 * 3 + 4);
    const back = readErf(bytes);
    expect(back.fileType).toBe("MOD ");
    expect(back.resources.map((r) => [r.resref, r.type, Array.from(r.data)])).toEqual([
      ["p_test", 2027, [1, 2, 3]],
      ["area", 2012, []],
      ["sixteencharacter", 2010, [9]],
    ]);
    expect(writeErf(back, { buildYear: 124, buildDay: 10 })).toEqual(bytes);
    expect(readEncapsulated(bytes).fileType).toBe("MOD ");
  });
  it("round-trips RIM", () => {
    const e = sample("RIM ");
    const bytes = writeRim(e);
    expect(bytes.length).toBe(120 + 32 * 3 + 4);
    const back = readRim(bytes);
    expect(back.fileType).toBe("RIM ");
    expect(back.get("P_TEST", 2027)?.data).toEqual(Uint8Array.from([1, 2, 3]));
    expect(writeEncapsulated(back)).toEqual(bytes);
    expect(readEncapsulated(bytes).resources).toHaveLength(3);
  });
  it("set replaces, remove removes", () => {
    const e = sample("MOD ");
    e.set("P_Test", 2027, Uint8Array.from([7]));
    expect(e.resources).toHaveLength(3);
    expect(e.get("p_test", 2027)?.data).toEqual(Uint8Array.from([7]));
    expect(e.remove("area", 2012)).toBe(true);
    expect(e.remove("area", 2012)).toBe(false);
    expect(e.has("area", 2012)).toBe(false);
    expect(() => writeErf(new Encapsulated("ERF ", [{ resref: "seventeen_chars__", type: 1, data: new Uint8Array(0) }]))).toThrow(/16 bytes/);
  });
  it("detects archive paths", () => {
    expect(isEncapsulatedPath("Modules\\danm13.mod")).toBe(true);
    expect(isEncapsulatedPath("Override")).toBe(false);
    expect(encapsulatedFileTypeFromPath("saves/x.SAV")).toBe("SAV ");
    expect(encapsulatedFileTypeFromPath("a.rim")).toBe("RIM ");
  });
});
