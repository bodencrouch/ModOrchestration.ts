/**
 * Path sandbox: placeholder resolution and root containment checks.
 *
 * Every path inside core is a POSIX-style string ("/" separators), even on
 * Windows and even for Windows drive-letter or UNC paths ("C:/Games/KOTOR",
 * "//server/share/mods"). Nothing here switches between path.win32 and
 * path.posix at runtime: the string is normalized first, then handled with
 * plain segment arithmetic, so Windows-authored instruction files behave the
 * same on Linux CI as on a Windows desktop.
 */

import type { Directories } from "../model/types.js";

export const MOD_DIRECTORY_PLACEHOLDER = "<<modDirectory>>";
export const KOTOR_DIRECTORY_PLACEHOLDER = "<<kotorDirectory>>";

const PLACEHOLDER_RE = /<<\s*(modDirectory|kotorDirectory)\s*>>/gi;
const DRIVE_ROOT_RE = /^[A-Za-z]:\//;
const UNC_ROOT_RE = /^\/\/[^/]+\/[^/]+(?:\/|$)/;

export type RootKind = "mod" | "kotor";

/** Thrown when a resolved path lands outside both sandbox roots. */
export class PathEscapeError extends Error {
  override readonly name = "PathEscapeError";
  constructor(
    /** The offending path, normalized. */
    readonly path: string,
    /** The root the path was expected to stay inside. */
    readonly root: string,
    /** The original instruction text, before resolution. */
    readonly raw?: string,
  ) {
    super(`Path "${raw ?? path}" resolves to "${path}", outside of "${root}"`);
  }
}

/** Thrown for relative paths that carry no `<<...>>` placeholder. */
export class MissingPlaceholderError extends Error {
  override readonly name = "MissingPlaceholderError";
  constructor(readonly raw: string) {
    super(
      `Path "${raw}" is relative and has no ${MOD_DIRECTORY_PLACEHOLDER} / ${KOTOR_DIRECTORY_PLACEHOLDER} placeholder`,
    );
  }
}

/** Deterministic code-unit ordering for names and paths (locale-independent). */
export function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Convert any separator style to forward slashes (UNC `\\srv\x` becomes `//srv/x`). */
export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Convert a POSIX-style path to the host's native separators (no-op outside Windows). */
export function toNative(p: string): string {
  return process.platform === "win32" ? p.replace(/\//g, "\\") : p;
}

/** True when the string carries a placeholder (case-insensitive). */
export function containsPlaceholder(raw: string): boolean {
  PLACEHOLDER_RE.lastIndex = 0;
  return PLACEHOLDER_RE.test(raw);
}

/** True for glob metacharacters we honour (`*` and `?`). Brackets/braces are literal in mod names. */
export function hasWildcard(p: string): boolean {
  return /[*?]/.test(p);
}

/**
 * Return the root prefix of an absolute POSIX-style path:
 * "/" for POSIX, "C:/" for a drive letter, "//server/share/" for UNC.
 * Returns "" for relative paths.
 */
export function rootOf(p: string): string {
  const posix = toPosix(p);
  const drive = DRIVE_ROOT_RE.exec(posix);
  if (drive) return drive[0].slice(0, 2).toUpperCase() + "/";
  const unc = UNC_ROOT_RE.exec(posix);
  if (unc) return unc[0].endsWith("/") ? unc[0] : unc[0] + "/";
  if (posix.startsWith("/")) return "/";
  return "";
}

/** True for `/x`, `C:/x`, `C:\x`, `//server/share`, `\\server\share`. */
export function isAbsolutePath(p: string): boolean {
  return rootOf(p) !== "";
}

/**
 * Normalize a path: forward slashes, `.` and `..` collapsed, duplicate
 * slashes removed, no trailing slash (except for a bare root). `..` that
 * would climb above the root is dropped, like path.normalize does; callers
 * detect escapes by comparing against the sandbox roots afterwards.
 * Relative input stays relative ("" becomes ".").
 */
export function normalizePath(p: string): string {
  const posix = toPosix(p.trim());
  const root = rootOf(posix);
  const body = posix.slice(root.length);
  const out: string[] = [];
  for (const seg of body.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (root === "") out.push("..");
      continue;
    }
    out.push(seg);
  }
  if (root === "") return out.length === 0 ? "." : out.join("/");
  return root + out.join("/");
}

/** Split an absolute path into its root prefix and segments. */
export function splitPath(p: string): { root: string; segments: string[] } {
  const norm = normalizePath(p);
  const root = rootOf(norm);
  const body = norm.slice(root.length);
  return { root, segments: body === "" ? [] : body.split("/") };
}

/** Parent directory of a normalized POSIX-style path (root's parent is the root). */
export function parentPath(p: string): string {
  const { root, segments } = splitPath(p);
  if (segments.length === 0) return root;
  return root + segments.slice(0, -1).join("/");
}

/** Last segment of a path ("" for a bare root). */
export function baseName(p: string): string {
  const { segments } = splitPath(p);
  return segments.length === 0 ? "" : segments[segments.length - 1];
}

/** Join a directory and a relative tail into a normalized path. */
export function joinPath(dir: string, ...tail: string[]): string {
  return normalizePath([dir, ...tail].join("/"));
}

/**
 * Windows-style paths (drive letter, UNC) and paths on a Windows host are
 * compared case-insensitively; everything else is case-sensitive.
 */
function isCaseInsensitivePath(p: string): boolean {
  return process.platform === "win32" || rootOf(p) !== "/";
}

function fold(p: string, insensitive: boolean): string {
  return insensitive ? p.toLowerCase() : p;
}

/** True when `candidate` is `root` itself or lives under it. Both may be unnormalized. */
export function isInsideRoot(root: string, candidate: string): boolean {
  const r = normalizePath(root);
  const c = normalizePath(candidate);
  if (!isAbsolutePath(r) || !isAbsolutePath(c)) return false;
  const insensitive = isCaseInsensitivePath(r) || isCaseInsensitivePath(c);
  const rf = fold(r, insensitive);
  const cf = fold(c, insensitive);
  if (rf === cf) return true;
  const prefix = rf.endsWith("/") ? rf : rf + "/";
  return cf.startsWith(prefix);
}

/** POSIX-style relative path from `root` to `candidate` ("" when equal); undefined when outside. */
export function relativeInsideRoot(root: string, candidate: string): string | undefined {
  if (!isInsideRoot(root, candidate)) return undefined;
  const r = normalizePath(root);
  const c = normalizePath(candidate);
  if (r.length >= c.length) return "";
  const rel = c.slice(r.endsWith("/") ? r.length : r.length + 1);
  return rel;
}

function normalizedDirs(dirs: Directories): { mod: string; kotor: string } {
  return { mod: normalizePath(dirs.modDirectory), kotor: normalizePath(dirs.kotorDirectory) };
}

/**
 * Classify an absolute path as living under the mod or the kotor directory.
 * When one root nests inside the other, the deeper (longer) root wins.
 * Throws PathEscapeError when the path is outside both.
 */
export function relativeToRoot(dirs: Directories, abs: string): { root: RootKind; rel: string } {
  const { mod, kotor } = normalizedDirs(dirs);
  const relMod = relativeInsideRoot(mod, abs);
  const relKotor = relativeInsideRoot(kotor, abs);
  if (relMod !== undefined && relKotor !== undefined) {
    return kotor.length > mod.length ? { root: "kotor", rel: relKotor } : { root: "mod", rel: relMod };
  }
  if (relMod !== undefined) return { root: "mod", rel: relMod };
  if (relKotor !== undefined) return { root: "kotor", rel: relKotor };
  throw new PathEscapeError(normalizePath(abs), mod, abs);
}

/**
 * Convert an absolute path back to placeholder form for the editor:
 * "<<modDirectory>>/foo/bar.zip", or bare "<<kotorDirectory>>" for the root.
 * Paths outside both roots are returned normalized but otherwise unchanged
 * so the editor can surface them as a validation problem instead of crashing.
 */
export function unresolve(dirs: Directories, abs: string): string {
  let classified: { root: RootKind; rel: string };
  try {
    classified = relativeToRoot(dirs, abs);
  } catch (err) {
    if (err instanceof PathEscapeError) return normalizePath(abs);
    throw err;
  }
  const placeholder = classified.root === "mod" ? MOD_DIRECTORY_PLACEHOLDER : KOTOR_DIRECTORY_PLACEHOLDER;
  return classified.rel === "" ? placeholder : `${placeholder}/${classified.rel}`;
}

/**
 * Resolves instruction paths to absolute, normalized, sandboxed POSIX-style
 * paths. Wildcards are preserved verbatim (see fs/wildcards.ts).
 */
export class PathResolver {
  readonly dirs: Directories;
  private readonly mod: string;
  private readonly kotor: string;

  constructor(dirs: Directories) {
    this.dirs = { modDirectory: dirs.modDirectory, kotorDirectory: dirs.kotorDirectory };
    const n = normalizedDirs(dirs);
    this.mod = n.mod;
    this.kotor = n.kotor;
  }

  /** Normalized mod directory root. */
  get modDirectory(): string {
    return this.mod;
  }

  /** Normalized kotor directory root. */
  get kotorDirectory(): string {
    return this.kotor;
  }

  resolve(raw: string): string {
    const trimmed = raw.trim();
    let usedRoot: RootKind | undefined;
    PLACEHOLDER_RE.lastIndex = 0;
    const substituted = trimmed.replace(PLACEHOLDER_RE, (_m, name: string) => {
      const kind: RootKind = name.toLowerCase() === "moddirectory" ? "mod" : "kotor";
      usedRoot ??= kind;
      return kind === "mod" ? this.mod : this.kotor;
    });

    if (usedRoot === undefined) {
      if (trimmed === "" || !isAbsolutePath(substituted)) throw new MissingPlaceholderError(raw);
    }

    const resolved = normalizePath(substituted);
    if (!isAbsolutePath(resolved)) throw new MissingPlaceholderError(raw);

    if (isInsideRoot(this.mod, resolved) || isInsideRoot(this.kotor, resolved)) return resolved;
    const expectedRoot = usedRoot === "kotor" ? this.kotor : this.mod;
    throw new PathEscapeError(resolved, expectedRoot, raw);
  }

  resolveMany(raw: readonly string[]): string[] {
    return raw.map((r) => this.resolve(r));
  }

  /** Inverse of resolve, for the editor. */
  unresolve(abs: string): string {
    return unresolve(this.dirs, abs);
  }

  relativeToRoot(abs: string): { root: RootKind; rel: string } {
    return relativeToRoot(this.dirs, abs);
  }
}
