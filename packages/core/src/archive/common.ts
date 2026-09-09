/**
 * Helpers shared by the archive adapters.
 */

import { comparePaths } from "../fs/paths.js";
import type { ArchiveEntry } from "../ports/archive.js";

export class ArchiveError extends Error {
  override readonly name: string = "ArchiveError";
  constructor(
    message: string,
    readonly archivePath: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export class ArchiveEntryNotFoundError extends ArchiveError {
  override readonly name = "ArchiveEntryNotFoundError";
  constructor(archivePath: string, readonly entryPath: string) {
    super(`Entry "${entryPath}" not found in "${archivePath}"`, archivePath);
  }
}

/**
 * Normalize an entry name as stored in an archive to the ArchiveEntry
 * convention: forward slashes, no leading "./" or "/", no trailing slash,
 * no empty segments. Returns undefined for names that are empty or that
 * try to climb out with ".." (zip-slip); callers drop those entries.
 */
export function normalizeEntryPath(name: string): { path: string; isDirectory: boolean } | undefined {
  const posix = name.replace(/\\/g, "/");
  const isDirectory = posix.endsWith("/");
  const segments: string[] = [];
  for (const seg of posix.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return undefined;
    segments.push(seg);
  }
  if (segments.length === 0) return undefined;
  // Windows drive prefixes ("C:") never belong in an entry name.
  if (/^[A-Za-z]:$/.test(segments[0])) segments.shift();
  if (segments.length === 0) return undefined;
  return { path: segments.join("/"), isDirectory };
}

/** Exact match first, then case-insensitive. */
export function findEntry<T extends ArchiveEntry>(entries: readonly T[], entryPath: string): T | undefined {
  const wanted = normalizeEntryPath(entryPath)?.path ?? entryPath;
  const exact = entries.find((e) => e.path === wanted);
  if (exact) return exact;
  const lower = wanted.toLowerCase();
  return entries.find((e) => e.path.toLowerCase() === lower);
}

/** Directory paths implied by a file path ("a/b/c.txt" -> ["a", "a/b"]). */
export function impliedDirectories(entryPath: string): string[] {
  const parts = entryPath.split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

/** Sort entries so parents come before children; stable for equal depth. */
export function sortEntries<T extends ArchiveEntry>(entries: T[]): T[] {
  return entries.sort((a, b) => comparePaths(a.path, b.path));
}
