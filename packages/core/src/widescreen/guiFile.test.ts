import { describe, it, expect } from "vitest";
import { GffFieldType, createGffRoot, createGffStruct, readGff, writeGff, type GffStruct } from "@modsync/kotor-formats";
import { extractGuiRects, resizeGuiFile } from "./guiFile.js";

function extent(l: number, t: number, w: number, h: number): GffStruct {
  const s = createGffStruct(0);
  s.fields.set("LEFT", { type: GffFieldType.Int, value: l });
  s.fields.set("TOP", { type: GffFieldType.Int, value: t });
  s.fields.set("WIDTH", { type: GffFieldType.Int, value: w });
  s.fields.set("HEIGHT", { type: GffFieldType.Int, value: h });
  return s;
}

function makeGui(): Uint8Array {
  const root = createGffRoot("GUI ");
  root.root.fields.set("EXTENT", { type: GffFieldType.Struct, value: extent(0, 0, 640, 480) });
  const button = createGffStruct(1);
  button.fields.set("EXTENT", { type: GffFieldType.Struct, value: extent(600, 440, 40, 40) });
  const centered = createGffStruct(2);
  centered.fields.set("EXTENT", { type: GffFieldType.Struct, value: extent(270, 200, 100, 80) });
  root.root.fields.set("CONTROLS", { type: GffFieldType.List, value: [button, centered] });
  return writeGff(root);
}

describe("resizeGuiFile", () => {
  it("extracts rects with paths", () => {
    const rects = extractGuiRects(makeGui());
    expect(rects.map((r) => r.path)).toEqual(["EXTENT", "CONTROLS/0/EXTENT", "CONTROLS/1/EXTENT"]);
  });
  it("rewrites EXTENT fields for the new size", () => {
    const out = resizeGuiFile(makeGui(), { w: 640, h: 480 }, { w: 1280, h: 960 });
    const gff = readGff(out);
    const rootExtent = gff.root.fields.get("EXTENT")!.value as GffStruct;
    expect(rootExtent.fields.get("WIDTH")!.value).toBe(1280);
    expect(rootExtent.fields.get("HEIGHT")!.value).toBe(960);
    const controls = gff.root.fields.get("CONTROLS")!.value as GffStruct[];
    const btn = controls[0]!.fields.get("EXTENT")!.value as GffStruct;
    // right/bottom anchored button keeps touching the far edges
    expect((btn.fields.get("LEFT")!.value as number) + (btn.fields.get("WIDTH")!.value as number)).toBe(1280);
    expect((btn.fields.get("TOP")!.value as number) + (btn.fields.get("HEIGHT")!.value as number)).toBe(960);
  });
  it("rejects non-GUI GFFs", () => {
    const root = createGffRoot("UTC ");
    root.root.fields.set("Tag", { type: GffFieldType.String, value: "x" });
    expect(() => resizeGuiFile(writeGff(root), { w: 640, h: 480 }, { w: 1280, h: 960 })).toThrow(/EXTENT/);
  });
});
