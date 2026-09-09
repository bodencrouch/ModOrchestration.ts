/**
 * Archive entry point: magic-byte detection and format dispatch.
 */

import { open } from "node:fs/promises";

import { normalizePath } from "../fs/paths.js";
import type { ArchiveFormat, ArchiveOpener, ArchiveReader } from "../ports/archive.js";
import { ArchiveError } from "./common.js";
import { openRar } from "./rar.js";
import { openSevenZip } from "./sevenZip.js";
import { findSevenZipSignature, openSfx, type SignatureScanOptions } from "./sfx.js";
import { openZip } from "./zip.js";

export * from "./common.js";
export * from "./zip.js";
export * from "./rar.js";
export * from "./sevenZip.js";
export * from "./sfx.js";

export const ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z", ".exe"] as const;

const ZIP_MAGIC = [Buffer.from("PK\x03\x04", "latin1"), Buffer.from("PK\x05\x06", "latin1")];
const RAR_MAGIC = Buffer.from("Rar!\x1a\x07", "latin1");
const SEVEN_ZIP_MAGIC = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
const MZ_MAGIC = Buffer.from("MZ", "latin1");

export class UnsupportedArchiveError extends ArchiveError {
  override readonly name = "UnsupportedArchiveError";
  constructor(archivePath: string) {
    super(`"${archivePath}" is not a supported archive (zip, rar, 7z, 7z SFX)`, archivePath);
  }
}

export interface OpenArchiveOptions {
  /** External 7z CLI used as a fallback for 7z / SFX when the wasm build fails. */
  sevenZipPath?: string;
  password?: string;
  /** Tuning for the SFX signature scan. */
  sfxScan?: SignatureScanOptions;
}

/** True for file names ending in .zip, .rar, .7z or .exe (case-insensitive). */
export function isArchiveExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Detect the archive format from a header buffer (first bytes of the file). */
export function detectArchiveFormatFromBytes(header: Uint8Array): ArchiveFormat | "mz" | undefined {
  const buf = Buffer.from(header.buffer, header.byteOffset, header.byteLength);
  if (ZIP_MAGIC.some((m) => buf.length >= m.length && buf.subarray(0, m.length).equals(m))) return "zip";
  if (buf.length >= RAR_MAGIC.length && buf.subarray(0, RAR_MAGIC.length).equals(RAR_MAGIC)) return "rar";
  if (buf.length >= SEVEN_ZIP_MAGIC.length && buf.subarray(0, SEVEN_ZIP_MAGIC.length).equals(SEVEN_ZIP_MAGIC)) return "7z";
  if (buf.length >= MZ_MAGIC.length && buf.subarray(0, MZ_MAGIC.length).equals(MZ_MAGIC)) return "mz";
  return undefined;
}

/**
 * Detect the archive format by magic bytes. An `MZ` executable counts as
 * "7z-sfx" only when a 7z signature is embedded in it. Returns undefined for
 * anything else; filesystem errors (missing file) propagate.
 */
export async function detectArchiveFormat(
  archivePath: string,
  opts: { sfxScan?: SignatureScanOptions } = {},
): Promise<ArchiveFormat | undefined> {
  const norm = normalizePath(archivePath);
  const handle = await open(norm, "r");
  let header: Buffer;
  try {
    header = Buffer.alloc(8);
    const { bytesRead } = await handle.read(header, 0, 8, 0);
    header = header.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const detected = detectArchiveFormatFromBytes(header);
  if (detected === "mz") {
    const offset = await findSevenZipSignature(norm, { start: 2, ...opts.sfxScan });
    return offset === undefined ? undefined : "7z-sfx";
  }
  return detected;
}

/** Open an archive of any supported format, detected by content. */
export async function openArchive(archivePath: string, opts: OpenArchiveOptions = {}): Promise<ArchiveReader> {
  const norm = normalizePath(archivePath);
  const format = await detectArchiveFormat(norm, { sfxScan: opts.sfxScan });
  switch (format) {
    case "zip":
      return openZip(norm);
    case "rar":
      return openRar(norm, { password: opts.password });
    case "7z":
      return openSevenZip(norm, { sevenZipPath: opts.sevenZipPath, password: opts.password, format: "7z" });
    case "7z-sfx":
      return openSfx(norm, { sevenZipPath: opts.sevenZipPath, password: opts.password, scan: opts.sfxScan });
    default:
      throw new UnsupportedArchiveError(norm);
  }
}

/** ArchiveOpener port implementation bound to a set of options. */
export function createArchiveOpener(opts: OpenArchiveOptions = {}): ArchiveOpener {
  return {
    detect: (p) => detectArchiveFormat(p, { sfxScan: opts.sfxScan }),
    open: (p) => openArchive(p, opts),
  };
}
