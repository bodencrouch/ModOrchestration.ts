/**
 * UniWS-style executable resolution patcher.
 *
 * HEURISTIC, NOT A DISASSEMBLER. The KOTOR executables (`swkotor.exe`,
 * `swkotor2.exe`) contain a table of 4:3 resolutions the engine offers in
 * its options screen, stored as consecutive little-endian u32 `width,height`
 * pairs: 640x480, 800x600, 1024x768, 1280x960, 1600x1200. The classic
 * UniWS widescreen patch works by overwriting the highest entry (1600x1200)
 * with the desired resolution; the game then lists and accepts it.
 *
 * This module does the same thing: it scans the raw bytes (at every byte
 * offset, not only aligned ones, because the pair can also appear as
 * `push` immediates) for the `1600,1200` pair and replaces every occurrence
 * with the requested size. It refuses to touch the file when the pair is not
 * found at all or when it is found suspiciously often (more than
 * {@link MAX_PATCH_SITES}), since that suggests a different binary than the
 * ones this heuristic was written for. The caller keeps a backup and must
 * still resize the `.gui` files (see `gui.ts`) for the change to look right.
 */
import type { TargetGame } from "../model/types.js";

export type ResolutionPair = readonly [width: number, height: number];

/** The 4:3 table shipped with both games, in the order it appears in the exe. */
export const KOTOR_RESOLUTION_TABLE: readonly ResolutionPair[] = [
  [640, 480],
  [800, 600],
  [1024, 768],
  [1280, 960],
  [1600, 1200],
];

/** The table entry that UniWS replaces. */
export const PATCH_TARGET_PAIR: ResolutionPair = [1600, 1200];

/** Refuse to patch when the target pair appears more often than this. */
export const MAX_PATCH_SITES = 4;

export class WidescreenPatchError extends Error {
  constructor(
    message: string,
    readonly code: "not-found" | "too-many" | "invalid-resolution" | "already-patched" | "unsupported-game",
  ) {
    super(message);
    this.name = "WidescreenPatchError";
  }
}

export interface ResolutionMatch {
  width: number;
  height: number;
  /** Byte offset of the width u32; the height u32 follows at offset + 4. */
  offset: number;
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function writeU32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

/** Find every byte offset at which the little-endian u32 pair `width,height` occurs. */
export function findResolutionPair(bytes: Uint8Array, width: number, height: number): number[] {
  const offsets: number[] = [];
  const w0 = width & 0xff;
  for (let i = 0; i + 8 <= bytes.length; i++) {
    if (bytes[i] !== w0) continue;
    if (readU32LE(bytes, i) === width && readU32LE(bytes, i + 4) === height) offsets.push(i);
  }
  return offsets;
}

/**
 * Locate occurrences of known 4:3 resolution pairs. By default looks for every
 * entry of {@link KOTOR_RESOLUTION_TABLE}; pass `pairs` to look for others.
 * Results are sorted by offset.
 */
export function detectResolutions(
  bytes: Uint8Array,
  pairs: readonly ResolutionPair[] = KOTOR_RESOLUTION_TABLE,
): ResolutionMatch[] {
  const out: ResolutionMatch[] = [];
  for (const [width, height] of pairs) {
    for (const offset of findResolutionPair(bytes, width, height)) out.push({ width, height, offset });
  }
  return out.sort((a, b) => a.offset - b.offset);
}

/**
 * True when the five table entries occur back to back (8 bytes apart) at
 * least once, i.e. the exe carries the untouched resolution table.
 */
export function hasResolutionTable(bytes: Uint8Array): boolean {
  const [first] = KOTOR_RESOLUTION_TABLE[0];
  outer: for (const start of findResolutionPair(bytes, first, KOTOR_RESOLUTION_TABLE[0][1])) {
    for (let i = 1; i < KOTOR_RESOLUTION_TABLE.length; i++) {
      const off = start + i * 8;
      const [w, h] = KOTOR_RESOLUTION_TABLE[i];
      if (off + 8 > bytes.length || readU32LE(bytes, off) !== w || readU32LE(bytes, off + 4) !== h) continue outer;
    }
    return true;
  }
  return false;
}

export function validateResolution(width: number, height: number): void {
  const ok = (n: number) => Number.isInteger(n) && n >= 320 && n <= 16384;
  if (!ok(width) || !ok(height)) {
    throw new WidescreenPatchError(
      `Unsupported resolution ${width}x${height}: both sides must be integers between 320 and 16384`,
      "invalid-resolution",
    );
  }
}

export interface PatchResult {
  /** A copy of the input with the replacements applied (the input is not modified). */
  patched: Uint8Array;
  /** Byte offsets (of the width u32) that were rewritten. */
  offsets: number[];
}

/**
 * Replace the `1600x1200` table entry with `width`x`height` (UniWS heuristic,
 * see the module docblock). Throws {@link WidescreenPatchError} when the
 * pair is not found, is found more than {@link MAX_PATCH_SITES} times, when
 * the exe already contains the target pair and no 1600x1200 entry (already
 * patched), or for an out-of-range resolution.
 */
export function patchExecutableResolution(
  exeBytes: Uint8Array,
  game: TargetGame,
  width: number,
  height: number,
): PatchResult {
  if (game !== "KOTOR1" && game !== "KOTOR2") {
    throw new WidescreenPatchError(`Cannot patch an executable for game "${game}"`, "unsupported-game");
  }
  validateResolution(width, height);
  const [tw, th] = PATCH_TARGET_PAIR;
  const offsets = findResolutionPair(exeBytes, tw, th);
  if (offsets.length === 0) {
    if (findResolutionPair(exeBytes, width, height).length > 0) {
      throw new WidescreenPatchError(
        `Executable already contains ${width}x${height} and no ${tw}x${th} entry; it looks patched already`,
        "already-patched",
      );
    }
    throw new WidescreenPatchError(
      `No ${tw}x${th} resolution entry found; this does not look like a supported ${game} executable`,
      "not-found",
    );
  }
  if (offsets.length > MAX_PATCH_SITES) {
    throw new WidescreenPatchError(
      `Found ${offsets.length} occurrences of ${tw}x${th} (max ${MAX_PATCH_SITES}); refusing to patch an unrecognised executable`,
      "too-many",
    );
  }
  const patched = new Uint8Array(exeBytes);
  for (const off of offsets) {
    writeU32LE(patched, off, width);
    writeU32LE(patched, off + 4, height);
  }
  return { patched, offsets };
}
