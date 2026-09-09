/**
 * RAR adapter built on node-unrar-js (the official unrar sources compiled to
 * wasm). The wasm binary is loaded explicitly from the package so bundlers
 * and odd working directories cannot break resolution.
 */

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { createExtractorFromFile } from "node-unrar-js";
import type { FileHeader } from "node-unrar-js";

import { joinPath, normalizePath } from "../fs/paths.js";
import type { ArchiveEntry, ArchiveReader } from "../ports/archive.js";
import { ArchiveEntryNotFoundError, ArchiveError, findEntry, normalizeEntryPath, sortEntries } from "./common.js";

const require = createRequire(import.meta.url);

let wasmBinaryPromise: Promise<ArrayBuffer> | undefined;

/** Locate and read `dist/js/unrar.wasm` from the installed node-unrar-js package. */
export function loadUnrarWasm(): Promise<ArrayBuffer> {
  wasmBinaryPromise ??= (async () => {
    const entry = require.resolve("node-unrar-js");
    const wasmPath = path.join(path.dirname(entry), "js", "unrar.wasm");
    const buf = await readFile(wasmPath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  })();
  return wasmBinaryPromise;
}

interface RarEntryRecord extends ArchiveEntry {
  /** Name exactly as unrar reports it (used to filter extraction). */
  rawName: string;
}

function toRecord(header: FileHeader): RarEntryRecord | undefined {
  const normalized = normalizeEntryPath(header.name);
  if (!normalized) return undefined;
  const isDirectory = header.flags.directory || normalized.isDirectory;
  return { path: normalized.path, isDirectory, size: isDirectory ? 0 : header.unpSize, rawName: header.name };
}

export class RarArchive implements ArchiveReader {
  readonly format = "rar" as const;
  private entriesPromise: Promise<RarEntryRecord[]> | undefined;

  private constructor(
    readonly archivePath: string,
    private readonly password?: string,
  ) {}

  static async open(archivePath: string, opts?: { password?: string }): Promise<RarArchive> {
    const archive = new RarArchive(normalizePath(archivePath), opts?.password);
    // Fail early on unreadable/corrupt archives.
    await archive.records();
    return archive;
  }

  async list(): Promise<ArchiveEntry[]> {
    return (await this.records()).map(({ path: p, isDirectory, size }) => ({ path: p, isDirectory, size }));
  }

  async extract(destDir: string, filter?: (entry: ArchiveEntry) => boolean): Promise<string[]> {
    const dest = normalizePath(destDir);
    await mkdir(dest, { recursive: true });
    const records = await this.records();
    const selected = new Map<string, RarEntryRecord>();
    for (const r of records) if (!filter || filter(r)) selected.set(r.rawName, r);
    if (selected.size === 0) return [];

    const written: string[] = [];
    for (const r of selected.values()) {
      if (r.isDirectory) await mkdir(joinPath(dest, r.path), { recursive: true });
    }
    const extractor = await this.extractor(dest);
    try {
      const result = extractor.extract({ files: (header) => selected.has(header.name) });
      for (const file of result.files) {
        const record = selected.get(file.fileHeader.name);
        if (record && !record.isDirectory) written.push(joinPath(dest, record.path));
      }
    } catch (err) {
      throw new ArchiveError(`Failed to extract "${this.archivePath}": ${(err as Error).message}`, this.archivePath, { cause: err });
    }
    return written;
  }

  async readEntry(entryPath: string): Promise<Uint8Array> {
    const record = findEntry(await this.records(), entryPath);
    if (!record) throw new ArchiveEntryNotFoundError(this.archivePath, entryPath);
    if (record.isDirectory) throw new ArchiveError(`"${entryPath}" is a directory`, this.archivePath);
    const temp = await mkdtemp(path.join(tmpdir(), "modsync-rar-"));
    try {
      const [file] = await this.extract(temp, (e) => e.path === record.path);
      if (!file) throw new ArchiveEntryNotFoundError(this.archivePath, entryPath);
      const buf = await readFile(file);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }

  async close(): Promise<void> {
    // node-unrar-js closes the archive handle at the end of every operation.
  }

  private async extractor(targetPath?: string) {
    const wasmBinary = await loadUnrarWasm();
    try {
      return await createExtractorFromFile({
        wasmBinary,
        filepath: this.archivePath,
        targetPath,
        password: this.password,
      });
    } catch (err) {
      throw new ArchiveError(`Cannot open rar "${this.archivePath}": ${(err as Error).message}`, this.archivePath, { cause: err });
    }
  }

  private records(): Promise<RarEntryRecord[]> {
    this.entriesPromise ??= (async () => {
      const extractor = await this.extractor();
      const out: RarEntryRecord[] = [];
      const seen = new Set<string>();
      try {
        const list = extractor.getFileList();
        for (const header of list.fileHeaders) {
          const record = toRecord(header);
          if (!record) continue;
          const key = record.path.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(record);
        }
      } catch (err) {
        throw new ArchiveError(`Cannot read rar "${this.archivePath}": ${(err as Error).message}`, this.archivePath, { cause: err });
      }
      return sortEntries(out);
    })();
    return this.entriesPromise;
  }
}

export function openRar(path: string, opts?: { password?: string }): Promise<ArchiveReader> {
  return RarArchive.open(path, opts);
}
