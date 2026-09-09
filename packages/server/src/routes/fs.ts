/**
 * Local file system browsing for the directory picker and the editor's
 * "browse into archive" feature. This is a local app: every readable path is
 * browsable. Symlinks are reported with the type of their target but never
 * followed recursively (listing is one level deep), so loops cannot bite.
 */
import { access, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve as resolvePath } from "node:path";
import type { FastifyInstance } from "fastify";
import { openArchive } from "@modsync/core";
import { HttpError, type AppState } from "../state.js";
import { fsErrorStatus, queryString } from "./util.js";

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  isSymlink?: boolean;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: DirEntry[];
}

export async function listRoots(state: AppState): Promise<string[]> {
  const roots: string[] = [];
  const push = (p: string | undefined): void => {
    if (p && !roots.includes(p)) roots.push(p);
  };
  push(homedir());
  push(process.cwd());
  push(state.settings.kotorDirectory || undefined);
  push(state.settings.modDirectory || undefined);
  if (process.platform === "win32") {
    for (let c = 65; c <= 90; c++) {
      const drive = `${String.fromCharCode(c)}:\\`;
      try {
        await access(drive);
        push(drive);
      } catch {
        /* no such drive */
      }
    }
  } else {
    push("/");
  }
  return roots;
}

function compareEntries(a: DirEntry, b: DirEntry): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}

export async function browseDirectory(rawPath: string): Promise<BrowseResult> {
  const path = resolvePath(rawPath);
  let dirents;
  try {
    dirents = await readdir(path, { withFileTypes: true });
  } catch (err) {
    throw new HttpError(fsErrorStatus(err), `Cannot list "${path}": ${(err as Error).message}`);
  }
  const entries: DirEntry[] = [];
  for (const d of dirents) {
    const full = resolvePath(path, d.name);
    let isDirectory = d.isDirectory();
    let size: number | undefined;
    const isSymlink = d.isSymbolicLink();
    if (isSymlink || d.isFile()) {
      try {
        const st = await stat(full); // follows one link; ELOOP for cycles is caught below
        isDirectory = st.isDirectory();
        if (!isDirectory) size = st.size;
      } catch {
        if (isSymlink) continue; // dangling or looping link: not browsable, skip it
      }
    }
    entries.push({ name: d.name, path: full, isDirectory, size, isSymlink: isSymlink || undefined });
  }
  entries.sort(compareEntries);
  const parent = dirname(path);
  return { path, parent: parent === path ? null : parent, entries };
}

export function registerFsRoutes(app: FastifyInstance, state: AppState): void {
  app.get("/api/fs/roots", async () => ({ roots: await listRoots(state) }));

  app.get("/api/fs/browse", async (req) => {
    const path = queryString(req.query, "path")?.trim() || homedir();
    return browseDirectory(path);
  });

  app.get("/api/archive/list", async (req) => {
    const path = queryString(req.query, "path")?.trim();
    if (!path) throw new HttpError(400, "path query parameter is required");
    let reader;
    try {
      reader = await openArchive(resolvePath(path), { sevenZipPath: state.settings.sevenZipPath });
    } catch (err) {
      const status = (err as NodeJS.ErrnoException).code ? fsErrorStatus(err) : 400;
      throw new HttpError(status, err instanceof Error ? err.message : String(err));
    }
    try {
      const entries = await reader.list();
      return {
        path: resolvePath(path),
        format: reader.format,
        entries: entries.map((e) => ({ path: e.path, size: e.size, isDirectory: e.isDirectory })),
      };
    } finally {
      await reader.close().catch(() => undefined);
    }
  });
}
