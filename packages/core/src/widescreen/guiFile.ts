/**
 * Bridge between the pure geometry in ./gui.ts and real `.gui` GFF files.
 *
 * KOTOR GUI files are GFF documents whose root and every CONTROLS list entry
 * carry an `EXTENT` struct with INT fields LEFT, TOP, WIDTH, HEIGHT.
 */
import { GffFieldType, readGff, writeGff, type GffStruct } from "@modsync/kotor-formats";
import { resizeGuiFields, type GuiRect, type ResizeOptions, type ScreenSize } from "./gui.js";

const EXTENT = "EXTENT";
const CONTROLS = "CONTROLS";
const RECT_FIELDS = ["LEFT", "TOP", "WIDTH", "HEIGHT"] as const;

function numberField(s: GffStruct, label: string): number | undefined {
  const f = s.fields.get(label);
  return f && typeof f.value === "number" ? f.value : undefined;
}

function collect(struct: GffStruct, path: string, out: Array<{ rect: GuiRect; extent: GffStruct }>): void {
  const extent = struct.fields.get(EXTENT);
  if (extent && extent.type === GffFieldType.Struct) {
    const e = extent.value as GffStruct;
    const left = numberField(e, "LEFT");
    const top = numberField(e, "TOP");
    const width = numberField(e, "WIDTH");
    const height = numberField(e, "HEIGHT");
    if (left !== undefined && top !== undefined && width !== undefined && height !== undefined) {
      out.push({ rect: { path: path ? `${path}/${EXTENT}` : EXTENT, left, top, width, height }, extent: e });
    }
  }
  const controls = struct.fields.get(CONTROLS);
  if (controls && controls.type === GffFieldType.List) {
    (controls.value as GffStruct[]).forEach((child, i) =>
      collect(child, path ? `${path}/${CONTROLS}/${i}` : `${CONTROLS}/${i}`, out),
    );
  }
}

/** Extract every EXTENT rectangle from a parsed `.gui` GFF (root first, then controls depth-first). */
export function extractGuiRects(bytes: Uint8Array): GuiRect[] {
  const out: Array<{ rect: GuiRect; extent: GffStruct }> = [];
  collect(readGff(bytes).root, "", out);
  return out.map((o) => o.rect);
}

/**
 * Resize a `.gui` file from one screen size to another and return the new
 * bytes. Throws when the file is not a GFF or has no EXTENT structs.
 */
export function resizeGuiFile(bytes: Uint8Array, from: ScreenSize, to: ScreenSize, opts: ResizeOptions = {}): Uint8Array {
  const gff = readGff(bytes);
  const found: Array<{ rect: GuiRect; extent: GffStruct }> = [];
  collect(gff.root, "", found);
  if (found.length === 0) throw new Error("Not a KOTOR GUI file: no EXTENT structs found");
  const resized = resizeGuiFields(
    found.map((f) => f.rect),
    from,
    to,
    opts,
  );
  resized.forEach((r, i) => {
    const e = found[i]!.extent;
    const values: Record<(typeof RECT_FIELDS)[number], number> = { LEFT: r.left, TOP: r.top, WIDTH: r.width, HEIGHT: r.height };
    for (const label of RECT_FIELDS) {
      const field = e.fields.get(label)!;
      field.value = values[label];
    }
  });
  return writeGff(gff);
}
