import { describe, expect, it } from "vitest";
import {
  GFF_ROOT_STRUCT_ID,
  GffFieldType,
  type GffRoot,
  type GffStruct,
  addField,
  cloneGffStruct,
  createGffRoot,
  createGffStruct,
  createLocString,
  getFieldByPath,
  getListByPath,
  getStructByPath,
  parseGffFieldType,
  readGff,
  removeFieldByPath,
  setFieldByPath,
  writeGff,
} from "./gff.js";

function buildSample(): GffRoot {
  const root = createGffRoot("UTC");
  const r = root.root;
  addField(r, "Byte", GffFieldType.Byte, 200);
  addField(r, "Char", GffFieldType.Char, -5);
  addField(r, "Word", GffFieldType.Word, 60000);
  addField(r, "Short", GffFieldType.Short, -12345);
  addField(r, "DWord", GffFieldType.DWord, 0xfffffffe);
  addField(r, "Int", GffFieldType.Int, -100000);
  addField(r, "DWord64", GffFieldType.DWord64, 2n ** 63n + 5n);
  addField(r, "Int64", GffFieldType.Int64, -(2n ** 40n));
  addField(r, "Float", GffFieldType.Float, 2.5);
  addField(r, "Double", GffFieldType.Double, Math.PI);
  addField(r, "Tag", GffFieldType.String, "hello €uro");
  addField(r, "TemplateResRef", GffFieldType.ResRef, "p_test");
  addField(r, "FirstName", GffFieldType.LocString, createLocString(1234, [[0, "Bob"], [1, "Bobette"], [4, "Robert"]]));
  addField(r, "Blob", GffFieldType.Void, Uint8Array.from([1, 2, 3, 0, 255]));
  addField(r, "Orient", GffFieldType.Orientation, { x: 0.1, y: 0.2, z: 0.3, w: 0.4 });
  addField(r, "Pos", GffFieldType.Vector, { x: 1, y: 2, z: 3 });
  addField(r, "Ref", GffFieldType.StrRef, 77);
  const inner = createGffStruct(3);
  addField(inner, "Deep", GffFieldType.Int, 9);
  addField(inner, "EmptyList", GffFieldType.List, []);
  addField(r, "Sub", GffFieldType.Struct, inner);
  const feats: GffStruct[] = [];
  for (let i = 0; i < 3; i++) {
    const s = createGffStruct(1);
    addField(s, "Feat", GffFieldType.Word, 10 + i);
    const nested = createGffStruct(2);
    addField(nested, "N", GffFieldType.Byte, i);
    addField(s, "Nested", GffFieldType.List, i === 1 ? [] : [nested]);
    feats.push(s);
  }
  addField(r, "FeatList", GffFieldType.List, feats);
  addField(r, "Empty", GffFieldType.List, []);
  addField(r, "EmptyString", GffFieldType.String, "");
  addField(r, "NoLoc", GffFieldType.LocString, createLocString(-1));
  return root;
}

function expectRootEqual(a: GffRoot, b: GffRoot): void {
  expect(b.fileType).toBe(a.fileType);
  expect(b.root.id).toBe(GFF_ROOT_STRUCT_ID);
  expectStructEqual(a.root, b.root);
}
function expectStructEqual(a: GffStruct, b: GffStruct): void {
  expect([...b.fields.keys()]).toEqual([...a.fields.keys()]);
  for (const [label, fa] of a.fields) {
    const fb = b.fields.get(label)!;
    expect(fb.type).toBe(fa.type);
    if (fa.type === GffFieldType.Struct) {
      expect((fb.value as GffStruct).id).toBe((fa.value as GffStruct).id);
      expectStructEqual(fa.value as GffStruct, fb.value as GffStruct);
    } else if (fa.type === GffFieldType.List) {
      const la = fa.value as GffStruct[];
      const lb = fb.value as GffStruct[];
      expect(lb.length).toBe(la.length);
      la.forEach((s, i) => {
        expect(lb[i]!.id).toBe(s.id);
        expectStructEqual(s, lb[i]!);
      });
    } else if (fa.type === GffFieldType.Float) expect(fb.value).toBeCloseTo(fa.value as number, 6);
    else if (fa.type === GffFieldType.Orientation || fa.type === GffFieldType.Vector) {
      for (const k of Object.keys(fa.value as object)) expect((fb.value as Record<string, number>)[k]).toBeCloseTo((fa.value as Record<string, number>)[k]!, 6);
    } else expect(fb.value).toEqual(fa.value);
  }
}

describe("gff", () => {
  it("round-trips every field type, nested and empty lists and locstrings", () => {
    const sample = buildSample();
    const bytes = writeGff(sample);
    const back = readGff(bytes);
    expectRootEqual(sample, back);
    // writing the decoded tree again is byte-identical
    expect(writeGff(back)).toEqual(bytes);
  });

  it("decodes a hand-assembled minimal file and writes identical bytes", () => {
    const b = new Uint8Array(96);
    const dv = new DataView(b.buffer);
    const putStr = (off: number, s: string): void => {
      for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
    };
    putStr(0, "GFF ");
    putStr(4, "V3.2");
    const header = [56, 1, 68, 1, 80, 1, 96, 0, 96, 0, 96, 0];
    header.forEach((v, i) => dv.setUint32(8 + i * 4, v, true));
    dv.setUint32(56, 0xffffffff, true); // struct type
    dv.setUint32(60, 0, true); // field index 0 (FieldCount == 1)
    dv.setUint32(64, 1, true); // field count
    dv.setUint32(68, 5, true); // INT
    dv.setUint32(72, 0, true); // label 0
    dv.setInt32(76, -42, true); // inline value
    putStr(80, "Test");
    const root = readGff(b);
    expect(root.fileType).toBe("GFF ");
    expect(root.root.id).toBe(0xffffffff);
    expect(root.root.fields.size).toBe(1);
    expect(root.root.fields.get("Test")).toEqual({ type: GffFieldType.Int, value: -42 });
    expect(writeGff(root)).toEqual(b);
  });

  it("dedups labels and lays out sections in canonical order", () => {
    const sample = buildSample();
    const bytes = writeGff(sample);
    const dv = new DataView(bytes.buffer);
    const structCount = dv.getUint32(12, true);
    const fieldCount = dv.getUint32(20, true);
    const labelCount = dv.getUint32(28, true);
    expect(structCount).toBe(1 + 1 + 3 + 2); // root, Sub, 3 feats, 2 nested
    expect(labelCount).toBeLessThan(fieldCount); // "Feat", "Nested", "N" reused
    expect(dv.getUint32(8, true)).toBe(56);
    expect(dv.getUint32(16, true)).toBe(56 + 12 * structCount);
    expect(dv.getUint32(24, true)).toBe(56 + 12 * structCount + 12 * fieldCount);
    expect(dv.getUint32(32, true)).toBe(56 + 12 * structCount + 12 * fieldCount + 16 * labelCount);
  });

  it("rejects bad input", () => {
    expect(() => readGff(new Uint8Array(10))).toThrow(/too small/);
    const bytes = writeGff(buildSample());
    bytes[4] = 0x58; // corrupt the version
    expect(() => readGff(bytes)).toThrow(/version/);
  });

  it("path helpers navigate structs and lists", () => {
    const root = buildSample();
    expect(getFieldByPath(root, "FeatList/1/Feat")?.value).toBe(11);
    expect(getFieldByPath(root, "FeatList/0/Nested/0/N")?.value).toBe(0);
    expect(getFieldByPath(root, "Sub/Deep")?.value).toBe(9);
    expect(getFieldByPath(root, "FeatList/9/Feat")).toBeUndefined();
    expect(getFieldByPath(root, "Nope")).toBeUndefined();
    expect(getStructByPath(root, "")).toBe(root.root);
    expect(getStructByPath(root, "FeatList/2")?.id).toBe(1);
    expect(getStructByPath(root, "Sub")?.id).toBe(3);
    expect(getListByPath(root, "FeatList")?.length).toBe(3);
    setFieldByPath(root, "FeatList/1/Feat", 99);
    expect(getFieldByPath(root, "FeatList/1/Feat")?.value).toBe(99);
    setFieldByPath(root, "Sub/NewField", "x", GffFieldType.String);
    expect(getFieldByPath(root, "Sub/NewField")).toEqual({ type: GffFieldType.String, value: "x" });
    expect(() => setFieldByPath(root, "Sub/Missing", 1)).toThrow(/not found/);
    expect(removeFieldByPath(root, "Sub/NewField")).toBe(true);
    expect(removeFieldByPath(root, "Sub/NewField")).toBe(false);
    const clone = cloneGffStruct(root.root);
    (getFieldByPath(clone, "FirstName")!.value as { substrings: Map<number, string> }).substrings.set(0, "changed");
    expect((getFieldByPath(root, "FirstName")!.value as { substrings: Map<number, string> }).substrings.get(0)).toBe("Bob");
  });

  it("parses TSLPatcher field type names", () => {
    expect(parseGffFieldType("ExoLocString")).toBe(GffFieldType.LocString);
    expect(parseGffFieldType("position")).toBe(GffFieldType.Vector);
    expect(parseGffFieldType("14")).toBe(GffFieldType.Struct);
    expect(parseGffFieldType("bogus")).toBeUndefined();
  });
});
