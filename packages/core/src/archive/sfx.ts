/**
 * 7z self-extracting executables: an `MZ` stub followed by a regular 7z
 * archive. We locate the 7z signature with chunked reads (SFX stubs can be
 * large) and hand `{ path, offset }` to the 7z adapter.
 */

import { open } from "node:fs/promises";

import { normalizePath } from "../fs/paths.js";
import type { ArchiveReader } from "../ports/archive.js";
import { ArchiveError } from "./common.js";
import { openSevenZip, type SevenZipOptions } from "./sevenZip.js";

export const SEVEN_ZIP_SIGNATURE: Uint8Array = Uint8Array.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);

/** Default upper bound for the signature scan (SFX stubs are far smaller). */
export const DEFAULT_SFX_SCAN_LIMIT = 64 * 1024 * 1024;

export interface SignatureScanOptions {
  /** First byte to inspect. */
  start?: number;
  /** Bytes read per iteration. */
  chunkSize?: number;
  /** Stop after this many bytes (from `start`); Infinity scans the whole file. */
  maxBytes?: number;
}

export class NotAnSfxArchiveError extends ArchiveError {
  override readonly name = "NotAnSfxArchiveError";
  constructor(archivePath: string) {
    super(`No 7z payload found in "${archivePath}"`, archivePath);
  }
}

/**
 * Find the byte offset of the first 7z signature in a file, or undefined.
 * Reads the file in chunks, carrying the last `signature.length - 1` bytes
 * over so a signature straddling a chunk boundary is still found.
 */
export async function findSevenZipSignature(
  filePath: string,
  opts: SignatureScanOptions = {},
): Promise<number | undefined> {
  const start = opts.start ?? 0;
  const chunkSize = Math.max(opts.chunkSize ?? 1024 * 1024, SEVEN_ZIP_SIGNATURE.length);
  const maxBytes = opts.maxBytes ?? DEFAULT_SFX_SCAN_LIMIT;
  const signature = Buffer.from(SEVEN_ZIP_SIGNATURE);
  const carry = signature.length - 1;

  const handle = await open(normalizePath(filePath), "r");
  try {
    const buffer = Buffer.alloc(carry + chunkSize);
    let carried = 0;
    let position = start;
    let scanned = 0;
    while (scanned < maxBytes) {
      const toRead = Math.min(chunkSize, maxBytes - scanned);
      const { bytesRead } = await handle.read(buffer, carried, toRead, position);
      if (bytesRead === 0) break;
      const window = buffer.subarray(0, carried + bytesRead);
      const idx = window.indexOf(signature);
      if (idx !== -1) return position - carried + idx;
      // Keep the tail for the next round.
      const keep = Math.min(carry, window.length);
      window.copy(buffer, 0, window.length - keep);
      carried = keep;
      position += bytesRead;
      scanned += bytesRead;
    }
    return undefined;
  } finally {
    await handle.close();
  }
}

export interface SfxOptions extends Omit<SevenZipOptions, "format"> {
  scan?: SignatureScanOptions;
}

/** Open a 7z SFX executable as an archive. */
export async function openSfx(filePath: string, opts: SfxOptions = {}): Promise<ArchiveReader> {
  const offset = await findSevenZipSignature(filePath, opts.scan);
  if (offset === undefined) throw new NotAnSfxArchiveError(normalizePath(filePath));
  const { scan: _scan, ...sevenZipOpts } = opts;
  return openSevenZip({ path: filePath, offset }, { ...sevenZipOpts, format: "7z-sfx" });
}
