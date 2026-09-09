/**
 * SSF V1.1 (KOTOR soundset) reader/writer. See docs/KOTOR_FORMATS.md section 4.
 * `sounds` holds 28 strrefs, -1 = unset (0xFFFFFFFF on disk). The writer pads
 * to 40 entries (172 bytes) like PyKotor; the reader accepts 28 or more.
 */
import { BinaryReader, BinaryWriter } from "./binary.js";

export const SSF_SOUND_NAMES: readonly string[] = [
  "Battlecry 1",
  "Battlecry 2",
  "Battlecry 3",
  "Battlecry 4",
  "Battlecry 5",
  "Battlecry 6",
  "Selected 1",
  "Selected 2",
  "Selected 3",
  "Attack 1",
  "Attack 2",
  "Attack 3",
  "Pain 1",
  "Pain 2",
  "Low health",
  "Death",
  "Critical hit",
  "Target immune",
  "Place mine",
  "Disarm mine",
  "Stealth on",
  "Search",
  "Pick lock start",
  "Pick lock fail",
  "Pick lock done",
  "Leave party",
  "Rejoin party",
  "Poisoned",
];

export const SSF_SOUND_COUNT = 28;
const SSF_WRITE_COUNT = 40;

export class SsfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsfError";
  }
}

export interface Ssf {
  /** 28 strrefs, -1 = unset */
  sounds: number[];
}

export function createSsf(): Ssf {
  return { sounds: new Array<number>(SSF_SOUND_COUNT).fill(-1) };
}

/** Case-insensitive lookup of a sound name; -1 when unknown. Whitespace/underscore differences are ignored. */
export function ssfSoundIndex(name: string): number {
  const norm = (s: string): string => s.toLowerCase().replace(/[\s_]+/g, "");
  const n = norm(name);
  return SSF_SOUND_NAMES.findIndex((s) => norm(s) === n);
}

export function readSsf(bytes: Uint8Array): Ssf {
  if (bytes.length < 12) throw new SsfError(`SSF too small (${bytes.length} bytes)`);
  const r = new BinaryReader(bytes);
  const sig = r.string(4);
  const ver = r.string(4);
  if (sig !== "SSF " || ver !== "V1.1") throw new SsfError(`bad SSF signature "${sig}${ver}"`);
  const offset = r.u32();
  if (offset + SSF_SOUND_COUNT * 4 > bytes.length) throw new SsfError("SSF entry table exceeds file size");
  r.seek(offset);
  const ssf = createSsf();
  for (let i = 0; i < SSF_SOUND_COUNT; i++) {
    const v = r.u32();
    ssf.sounds[i] = v === 0xffffffff ? -1 : v;
  }
  return ssf;
}

export function writeSsf(ssf: Ssf): Uint8Array {
  const w = new BinaryWriter(12 + SSF_WRITE_COUNT * 4);
  w.string("SSF ").string("V1.1").u32(12);
  for (let i = 0; i < SSF_WRITE_COUNT; i++) {
    const v = ssf.sounds[i];
    w.u32(v === undefined || v < 0 ? 0xffffffff : v);
  }
  return w.toUint8Array();
}
