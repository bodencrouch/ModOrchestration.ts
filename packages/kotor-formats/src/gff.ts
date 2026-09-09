/**
 * GFF V3.2 reader/writer (utc, uti, utp, dlg, are, git, ifo, gui, ...).
 * See docs/KOTOR_FORMATS.md section 1.
 */
import { BinaryReader, BinaryWriter, encodeCp1252 } from "./binary.js";

export enum GffFieldType {
  Byte = 0,
  Char = 1,
  Word = 2,
  Short = 3,
  DWord = 4,
  Int = 5,
  DWord64 = 6,
  Int64 = 7,
  Float = 8,
  Double = 9,
  String = 10,
  ResRef = 11,
  LocString = 12,
  Void = 13,
  Struct = 14,
  List = 15,
  Orientation = 16,
  Vector = 17,
  StrRef = 18,
}

export interface GffLocString {
  /** dialog.tlk index, -1 = none */
  strref: number;
  /** keyed by StringID = LanguageID * 2 + Gender */
  substrings: Map<number, string>;
}
export interface GffVector {
  x: number;
  y: number;
  z: number;
}
export interface GffOrientation {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type GffValue =
  | number
  | bigint
  | string
  | GffLocString
  | Uint8Array
  | GffStruct
  | GffStruct[]
  | GffVector
  | GffOrientation;

export interface GffField {
  type: GffFieldType;
  value: GffValue;
}

export interface GffStruct {
  /** struct type id; the root struct uses 0xFFFFFFFF */
  id: number;
  /** insertion order is preserved and is the on-disk order */
  fields: Map<string, GffField>;
}

export interface GffRoot {
  /** 4-char file type such as "UTC " */
  fileType: string;
  version: "V3.2";
  root: GffStruct;
}

export const GFF_ROOT_STRUCT_ID = 0xffffffff;
const HEADER_SIZE = 56;

export class GffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GffError";
  }
}

export function createGffStruct(id = 0): GffStruct {
  return { id, fields: new Map() };
}

export function createGffRoot(fileType: string): GffRoot {
  return { fileType: normalizeFileType(fileType), version: "V3.2", root: createGffStruct(GFF_ROOT_STRUCT_ID) };
}

export function createLocString(strref = -1, substrings?: Iterable<[number, string]>): GffLocString {
  return { strref, substrings: new Map(substrings ?? []) };
}

export function normalizeFileType(fileType: string): string {
  return (fileType.toUpperCase() + "    ").slice(0, 4);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function readGff(bytes: Uint8Array): GffRoot {
  if (bytes.length < HEADER_SIZE) throw new GffError(`GFF too small (${bytes.length} bytes)`);
  const r = new BinaryReader(bytes);
  const fileType = r.string(4);
  const version = r.string(4);
  if (version !== "V3.2") throw new GffError(`unsupported GFF version "${version}" (expected V3.2)`);
  const structOffset = r.u32();
  const structCount = r.u32();
  const fieldOffset = r.u32();
  const fieldCount = r.u32();
  const labelOffset = r.u32();
  const labelCount = r.u32();
  const fieldDataOffset = r.u32();
  const fieldDataCount = r.u32();
  const fieldIndicesOffset = r.u32();
  const fieldIndicesCount = r.u32();
  const listIndicesOffset = r.u32();
  const listIndicesCount = r.u32();

  const check = (name: string, off: number, size: number): void => {
    if (off > bytes.length || off + size > bytes.length) throw new GffError(`${name} section (offset ${off}, size ${size}) exceeds file size ${bytes.length}`);
  };
  check("struct", structOffset, structCount * 12);
  check("field", fieldOffset, fieldCount * 12);
  check("label", labelOffset, labelCount * 16);
  check("field data", fieldDataOffset, fieldDataCount);
  check("field indices", fieldIndicesOffset, fieldIndicesCount);
  check("list indices", listIndicesOffset, listIndicesCount);
  if (structCount === 0) throw new GffError("GFF has no structs");

  const labels: string[] = [];
  for (let i = 0; i < labelCount; i++) {
    r.seek(labelOffset + i * 16);
    labels.push(r.fixedString(16));
  }

  const visiting = new Set<number>();

  const readField = (fieldIndex: number): [string, GffField] => {
    if (fieldIndex >= fieldCount) throw new GffError(`field index ${fieldIndex} out of range (${fieldCount})`);
    r.seek(fieldOffset + fieldIndex * 12);
    const type = r.u32() as GffFieldType;
    const labelIndex = r.u32();
    const dataPos = r.position;
    const data = r.u32();
    if (labelIndex >= labelCount) throw new GffError(`label index ${labelIndex} out of range (${labelCount})`);
    const label = labels[labelIndex]!;
    const inData = (): void => {
      if (data > fieldDataCount) throw new GffError(`field "${label}" data offset ${data} exceeds field data block (${fieldDataCount})`);
      r.seek(fieldDataOffset + data);
    };
    let value: GffValue;
    switch (type) {
      case GffFieldType.Byte:
        value = data & 0xff;
        break;
      case GffFieldType.Char:
        value = ((data & 0xff) << 24) >> 24;
        break;
      case GffFieldType.Word:
        value = data & 0xffff;
        break;
      case GffFieldType.Short:
        value = ((data & 0xffff) << 16) >> 16;
        break;
      case GffFieldType.DWord:
        value = data >>> 0;
        break;
      case GffFieldType.Int:
        value = data | 0;
        break;
      case GffFieldType.Float:
        r.seek(dataPos);
        value = r.f32();
        break;
      case GffFieldType.DWord64:
        inData();
        value = r.u64();
        break;
      case GffFieldType.Int64:
        inData();
        value = r.i64();
        break;
      case GffFieldType.Double:
        inData();
        value = r.f64();
        break;
      case GffFieldType.String: {
        inData();
        const len = r.u32();
        value = r.string(len);
        break;
      }
      case GffFieldType.ResRef: {
        inData();
        const len = r.u8();
        value = r.string(len);
        break;
      }
      case GffFieldType.LocString: {
        inData();
        r.u32(); // total size
        const strref = r.i32();
        const count = r.u32();
        const substrings = new Map<number, string>();
        for (let i = 0; i < count; i++) {
          const id = r.u32();
          const len = r.u32();
          substrings.set(id, r.string(len));
        }
        value = { strref, substrings };
        break;
      }
      case GffFieldType.Void: {
        inData();
        const len = r.u32();
        value = r.bytes(len);
        break;
      }
      case GffFieldType.Struct:
        value = readStruct(data);
        break;
      case GffFieldType.List: {
        if (data + 4 > listIndicesCount) throw new GffError(`list "${label}" offset ${data} exceeds list indices block (${listIndicesCount})`);
        r.seek(listIndicesOffset + data);
        const count = r.u32();
        const indices: number[] = [];
        for (let i = 0; i < count; i++) indices.push(r.u32());
        value = indices.map((idx) => readStruct(idx));
        break;
      }
      case GffFieldType.Orientation: {
        inData();
        value = { x: r.f32(), y: r.f32(), z: r.f32(), w: r.f32() };
        break;
      }
      case GffFieldType.Vector: {
        inData();
        value = { x: r.f32(), y: r.f32(), z: r.f32() };
        break;
      }
      case GffFieldType.StrRef: {
        inData();
        r.u32(); // size, always 4
        value = r.u32();
        break;
      }
      default:
        throw new GffError(`unknown GFF field type ${type} for label "${label}"`);
    }
    return [label, { type, value }];
  };

  const readStruct = (index: number): GffStruct => {
    if (index >= structCount) throw new GffError(`struct index ${index} out of range (${structCount})`);
    if (visiting.has(index)) throw new GffError(`cyclic struct reference at index ${index}`);
    visiting.add(index);
    r.seek(structOffset + index * 12);
    const id = r.u32();
    const dataOrOffset = r.u32();
    const count = r.u32();
    const indices: number[] = [];
    if (count === 1) indices.push(dataOrOffset);
    else if (count > 1) {
      if (dataOrOffset + count * 4 > fieldIndicesCount) throw new GffError(`struct ${index} field indices exceed field indices block`);
      r.seek(fieldIndicesOffset + dataOrOffset);
      for (let i = 0; i < count; i++) indices.push(r.u32());
    }
    const fields = new Map<string, GffField>();
    for (const fi of indices) {
      const [label, field] = readField(fi);
      fields.set(label, field);
    }
    visiting.delete(index);
    return { id, fields };
  };

  const root = readStruct(0);
  return { fileType, version: "V3.2", root };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

interface StructRec {
  id: number;
  data: number;
  count: number;
}
interface FieldRec {
  type: number;
  label: number;
  data: number;
  /** float payload written as raw IEEE bits */
  floatValue?: number;
}

function toInt(v: GffValue, label: string): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  throw new GffError(`field "${label}" expects a number, got ${describe(v)}`);
}
function toBig(v: GffValue, label: string): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string") return BigInt(v);
  throw new GffError(`field "${label}" expects a bigint, got ${describe(v)}`);
}
function toStr(v: GffValue, label: string): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  throw new GffError(`field "${label}" expects a string, got ${describe(v)}`);
}
function describe(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (v instanceof Uint8Array) return "bytes";
  if (Array.isArray(v)) return "list";
  return typeof v;
}

export function writeGff(root: GffRoot, fileType?: string): Uint8Array {
  const structs: StructRec[] = [];
  const fields: FieldRec[] = [];
  const labels: string[] = [];
  const labelIndex = new Map<string, number>();
  const fieldData = new BinaryWriter();
  const fieldIndices = new BinaryWriter();
  const listIndices = new BinaryWriter();

  const labelFor = (label: string): number => {
    let idx = labelIndex.get(label);
    if (idx === undefined) {
      if (encodeCp1252(label).length > 16) throw new GffError(`label "${label}" exceeds 16 bytes`);
      idx = labels.length;
      labels.push(label);
      labelIndex.set(label, idx);
    }
    return idx;
  };

  const writeStruct = (s: GffStruct, isRoot: boolean): number => {
    const index = structs.length;
    const rec: StructRec = { id: isRoot ? GFF_ROOT_STRUCT_ID : s.id >>> 0, data: 0, count: s.fields.size };
    structs.push(rec);
    const fieldIdxs: number[] = [];
    for (const [label, field] of s.fields) {
      const fi = fields.length;
      const frec: FieldRec = { type: field.type, label: labelFor(label), data: 0 };
      fields.push(frec);
      fieldIdxs.push(fi);
      encodeField(frec, label, field);
    }
    if (rec.count === 1) rec.data = fieldIdxs[0]!;
    else if (rec.count > 1) {
      rec.data = fieldIndices.length;
      for (const fi of fieldIdxs) fieldIndices.u32(fi);
    }
    return index;
  };

  const encodeField = (rec: FieldRec, label: string, field: GffField): void => {
    const v = field.value;
    switch (field.type) {
      case GffFieldType.Byte:
      case GffFieldType.Word:
        rec.data = toInt(v, label) & (field.type === GffFieldType.Byte ? 0xff : 0xffff);
        break;
      case GffFieldType.Char:
        rec.data = toInt(v, label) & 0xff;
        break;
      case GffFieldType.Short:
        rec.data = toInt(v, label) & 0xffff;
        break;
      case GffFieldType.DWord:
      case GffFieldType.Int:
        rec.data = toInt(v, label) >>> 0;
        break;
      case GffFieldType.Float:
        rec.floatValue = toInt(v, label);
        break;
      case GffFieldType.DWord64:
        rec.data = fieldData.length;
        fieldData.u64(toBig(v, label));
        break;
      case GffFieldType.Int64:
        rec.data = fieldData.length;
        fieldData.i64(toBig(v, label));
        break;
      case GffFieldType.Double:
        rec.data = fieldData.length;
        fieldData.f64(toInt(v, label));
        break;
      case GffFieldType.String: {
        const enc = encodeCp1252(toStr(v, label));
        rec.data = fieldData.length;
        fieldData.u32(enc.length).bytes(enc);
        break;
      }
      case GffFieldType.ResRef: {
        const enc = encodeCp1252(toStr(v, label));
        if (enc.length > 16) throw new GffError(`resref "${toStr(v, label)}" in field "${label}" exceeds 16 bytes`);
        rec.data = fieldData.length;
        fieldData.u8(enc.length).bytes(enc);
        break;
      }
      case GffFieldType.LocString: {
        const ls = v as GffLocString;
        if (typeof ls !== "object" || ls === null || !(ls.substrings instanceof Map)) throw new GffError(`field "${label}" expects a LocString`);
        const parts: [number, Uint8Array][] = [];
        for (const [id, text] of ls.substrings) parts.push([id, encodeCp1252(text)]);
        let total = 8;
        for (const [, b] of parts) total += 8 + b.length;
        rec.data = fieldData.length;
        fieldData.u32(total).i32(ls.strref).u32(parts.length);
        for (const [id, b] of parts) fieldData.u32(id).u32(b.length).bytes(b);
        break;
      }
      case GffFieldType.Void: {
        if (!(v instanceof Uint8Array)) throw new GffError(`field "${label}" expects bytes`);
        rec.data = fieldData.length;
        fieldData.u32(v.length).bytes(v);
        break;
      }
      case GffFieldType.Struct: {
        const child = v as GffStruct;
        if (typeof child !== "object" || child === null || !(child.fields instanceof Map)) throw new GffError(`field "${label}" expects a struct`);
        rec.data = writeStruct(child, false);
        break;
      }
      case GffFieldType.List: {
        if (!Array.isArray(v)) throw new GffError(`field "${label}" expects a list of structs`);
        const idxs = v.map((child) => writeStruct(child, false));
        rec.data = listIndices.length;
        listIndices.u32(idxs.length);
        for (const i of idxs) listIndices.u32(i);
        break;
      }
      case GffFieldType.Orientation: {
        const o = v as GffOrientation;
        rec.data = fieldData.length;
        fieldData.f32(o.x).f32(o.y).f32(o.z).f32(o.w);
        break;
      }
      case GffFieldType.Vector: {
        const p = v as GffVector;
        rec.data = fieldData.length;
        fieldData.f32(p.x).f32(p.y).f32(p.z);
        break;
      }
      case GffFieldType.StrRef:
        rec.data = fieldData.length;
        fieldData.u32(4).u32(toInt(v, label));
        break;
      default:
        throw new GffError(`unknown GFF field type ${field.type} for label "${label}"`);
    }
  };

  writeStruct(root.root, true);

  const structOffset = HEADER_SIZE;
  const fieldOffset = structOffset + 12 * structs.length;
  const labelOffset = fieldOffset + 12 * fields.length;
  const fieldDataOffset = labelOffset + 16 * labels.length;
  const fieldIndicesOffset = fieldDataOffset + fieldData.length;
  const listIndicesOffset = fieldIndicesOffset + fieldIndices.length;
  const total = listIndicesOffset + listIndices.length;

  const w = new BinaryWriter(total);
  w.fixedString(normalizeFileType(fileType ?? root.fileType), 4);
  w.string("V3.2");
  w.u32(structOffset).u32(structs.length);
  w.u32(fieldOffset).u32(fields.length);
  w.u32(labelOffset).u32(labels.length);
  w.u32(fieldDataOffset).u32(fieldData.length);
  w.u32(fieldIndicesOffset).u32(fieldIndices.length);
  w.u32(listIndicesOffset).u32(listIndices.length);
  for (const s of structs) w.u32(s.id).u32(s.data).u32(s.count);
  for (const f of fields) {
    w.u32(f.type).u32(f.label);
    if (f.floatValue !== undefined) w.f32(f.floatValue);
    else w.u32(f.data);
  }
  for (const l of labels) w.fixedString(l, 16);
  w.bytes(fieldData.toUint8Array());
  w.bytes(fieldIndices.toUint8Array());
  w.bytes(listIndices.toUint8Array());
  return w.toUint8Array();
}

// ---------------------------------------------------------------------------
// Path helpers. Paths use "/" separators: labels for struct members, 0-based
// integers for list elements, e.g. "FeatList/0/Feat", "ClassList/1/Class".
// ---------------------------------------------------------------------------

export function splitGffPath(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((s) => s.length > 0);
}

type Cursor = { kind: "struct"; struct: GffStruct } | { kind: "field"; field: GffField; label: string; parent: GffStruct };

function rootStruct(root: GffRoot | GffStruct): GffStruct {
  return "fields" in root ? root : root.root;
}

function walk(root: GffRoot | GffStruct, path: string | string[]): Cursor | undefined {
  const segs = Array.isArray(path) ? path : splitGffPath(path);
  let cur: Cursor = { kind: "struct", struct: rootStruct(root) };
  for (const seg of segs) {
    if (cur.kind === "struct") {
      const f = cur.struct.fields.get(seg);
      if (!f) return undefined;
      cur = { kind: "field", field: f, label: seg, parent: cur.struct };
    } else if (cur.field.type === GffFieldType.List) {
      if (!/^\d+$/.test(seg)) return undefined;
      const list = cur.field.value as GffStruct[];
      const s = list[Number(seg)];
      if (!s) return undefined;
      cur = { kind: "struct", struct: s };
    } else if (cur.field.type === GffFieldType.Struct) {
      const s = cur.field.value as GffStruct;
      const f = s.fields.get(seg);
      if (!f) return undefined;
      cur = { kind: "field", field: f, label: seg, parent: s };
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Find the field addressed by `path`, or undefined. */
export function getFieldByPath(root: GffRoot | GffStruct, path: string | string[]): GffField | undefined {
  const c = walk(root, path);
  return c?.kind === "field" ? c.field : undefined;
}

/**
 * Find the struct addressed by `path`. An empty path is the root struct; a
 * path ending in a Struct field yields that field's struct; a path ending in a
 * list index yields that element.
 */
export function getStructByPath(root: GffRoot | GffStruct, path: string | string[]): GffStruct | undefined {
  const c = walk(root, path);
  if (!c) return undefined;
  if (c.kind === "struct") return c.struct;
  if (c.field.type === GffFieldType.Struct) return c.field.value as GffStruct;
  return undefined;
}

/** Find a List field's array by path. */
export function getListByPath(root: GffRoot | GffStruct, path: string | string[]): GffStruct[] | undefined {
  const f = getFieldByPath(root, path);
  return f?.type === GffFieldType.List ? (f.value as GffStruct[]) : undefined;
}

/** Add (or replace) a field on a struct and return it. */
export function addField(struct: GffStruct, label: string, type: GffFieldType, value: GffValue): GffField {
  const field: GffField = { type, value };
  struct.fields.set(label, field);
  return field;
}

/**
 * Set the value of the field at `path`. If the field exists its type is kept
 * (unless `type` is given). If it does not exist and `type` is given, the field
 * is created on the parent struct. Throws when the path cannot be resolved.
 */
export function setFieldByPath(root: GffRoot | GffStruct, path: string | string[], value: GffValue, type?: GffFieldType): GffField {
  const segs = Array.isArray(path) ? path : splitGffPath(path);
  const existing = walk(root, segs);
  if (existing?.kind === "field") {
    existing.field.value = value;
    if (type !== undefined) existing.field.type = type;
    return existing.field;
  }
  if (existing?.kind === "struct") throw new GffError(`path "${segs.join("/")}" addresses a struct, not a field`);
  if (type === undefined) throw new GffError(`field "${segs.join("/")}" not found`);
  if (segs.length === 0) throw new GffError("cannot set a field at the empty path");
  const parent = getStructByPath(root, segs.slice(0, -1));
  if (!parent) throw new GffError(`parent struct of "${segs.join("/")}" not found`);
  return addField(parent, segs[segs.length - 1]!, type, value);
}

/** Remove the field at `path`; returns true if something was removed. */
export function removeFieldByPath(root: GffRoot | GffStruct, path: string | string[]): boolean {
  const c = walk(root, path);
  if (c?.kind !== "field") return false;
  return c.parent.fields.delete(c.label);
}

/** Deep-clone a struct (used by copy operations). */
export function cloneGffStruct(s: GffStruct): GffStruct {
  const out: GffStruct = { id: s.id, fields: new Map() };
  for (const [label, f] of s.fields) out.fields.set(label, cloneGffField(f));
  return out;
}

export function cloneGffField(f: GffField): GffField {
  const v = f.value;
  let value: GffValue;
  if (v instanceof Uint8Array) value = v.slice();
  else if (Array.isArray(v)) value = v.map(cloneGffStruct);
  else if (typeof v === "object" && v !== null && "fields" in v) value = cloneGffStruct(v);
  else if (typeof v === "object" && v !== null && "substrings" in v) value = { strref: v.strref, substrings: new Map(v.substrings) };
  else if (typeof v === "object" && v !== null) value = { ...v };
  else value = v;
  return { type: f.type, value };
}

const FIELD_TYPE_NAMES: Record<string, GffFieldType> = {
  byte: GffFieldType.Byte,
  char: GffFieldType.Char,
  word: GffFieldType.Word,
  short: GffFieldType.Short,
  dword: GffFieldType.DWord,
  uint32: GffFieldType.DWord,
  int: GffFieldType.Int,
  int32: GffFieldType.Int,
  dword64: GffFieldType.DWord64,
  uint64: GffFieldType.DWord64,
  int64: GffFieldType.Int64,
  float: GffFieldType.Float,
  double: GffFieldType.Double,
  exostring: GffFieldType.String,
  string: GffFieldType.String,
  cexostring: GffFieldType.String,
  resref: GffFieldType.ResRef,
  exolocstring: GffFieldType.LocString,
  cexolocstring: GffFieldType.LocString,
  locstring: GffFieldType.LocString,
  void: GffFieldType.Void,
  binary: GffFieldType.Void,
  struct: GffFieldType.Struct,
  list: GffFieldType.List,
  orientation: GffFieldType.Orientation,
  quaternion: GffFieldType.Orientation,
  vector: GffFieldType.Vector,
  position: GffFieldType.Vector,
  strref: GffFieldType.StrRef,
};

/** Parse a TSLPatcher-style field type name ("Word", "ExoLocString", "Position") or numeric id. */
export function parseGffFieldType(name: string): GffFieldType | undefined {
  const t = name.trim().toLowerCase();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n >= 0 && n <= 18 ? (n as GffFieldType) : undefined;
  }
  return FIELD_TYPE_NAMES[t];
}
