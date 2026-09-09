import { describe, expect, it } from "vitest";
import { BinaryReader, BinaryWriter, decodeCp1252, encodeCp1252, isCp1252Representable } from "./binary.js";

describe("cp1252", () => {
  it("round-trips every byte value", () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    expect(encodeCp1252(decodeCp1252(all))).toEqual(all);
  });
  it("maps the 0x80-0x9F block", () => {
    expect(decodeCp1252(Uint8Array.from([0x80, 0x93, 0x94, 0x99]))).toBe("€“”™");
    expect(Array.from(encodeCp1252("€“”™"))).toEqual([0x80, 0x93, 0x94, 0x99]);
  });
  it("matches Node's TextDecoder for windows-1252", () => {
    const bytes = Uint8Array.from([0x41, 0xe9, 0x80, 0x9f, 0xff, 0x85]);
    expect(decodeCp1252(bytes)).toBe(new TextDecoder("windows-1252").decode(bytes));
  });
  it("substitutes ? for unmappable characters", () => {
    expect(Array.from(encodeCp1252("a中b"))).toEqual([0x61, 0x3f, 0x62]);
    expect(isCp1252Representable("中")).toBe(false);
    expect(isCp1252Representable("café €")).toBe(true);
  });
});

describe("BinaryReader/BinaryWriter", () => {
  it("writes and reads all scalar types little-endian", () => {
    const w = new BinaryWriter(4);
    w.u8(0xfe).i8(-2).u16(0x1234).i16(-3).u32(0xdeadbeef).i32(-4).u64(2n ** 40n).i64(-5n).f32(1.5).f64(-2.25);
    w.fixedString("abc", 5).cstring("xy").string("z");
    const bytes = w.toUint8Array();
    expect(bytes.length).toBe(1 + 1 + 2 + 2 + 4 + 4 + 8 + 8 + 4 + 8 + 5 + 3 + 1);
    expect(Array.from(bytes.subarray(2, 4))).toEqual([0x34, 0x12]);
    const r = new BinaryReader(bytes);
    expect(r.u8()).toBe(0xfe);
    expect(r.i8()).toBe(-2);
    expect(r.u16()).toBe(0x1234);
    expect(r.i16()).toBe(-3);
    expect(r.u32()).toBe(0xdeadbeef);
    expect(r.i32()).toBe(-4);
    expect(r.u64()).toBe(2n ** 40n);
    expect(r.i64()).toBe(-5n);
    expect(r.f32()).toBe(1.5);
    expect(r.f64()).toBe(-2.25);
    expect(r.fixedString(5)).toBe("abc");
    expect(r.cstring()).toBe("xy");
    expect(r.string(1)).toBe("z");
    expect(r.remaining).toBe(0);
  });
  it("throws on reads past the end", () => {
    const r = new BinaryReader(new Uint8Array(2));
    r.u16();
    expect(() => r.u8()).toThrow(RangeError);
  });
  it("supports in-place patching", () => {
    const w = new BinaryWriter();
    w.u32(0).u16(0);
    w.setU32At(0, 7).setU16At(4, 9);
    const r = new BinaryReader(w.toUint8Array());
    expect(r.u32()).toBe(7);
    expect(r.u16()).toBe(9);
  });
});
