/**
 * Helpers shared by the CLI commands: settings from flags, reading
 * instruction files (TOML or markdown), issue printing and exit codes.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, resolve as resolvePath } from "node:path";
import {
  PATCHER_ENGINES,
  loadSettings,
  parseInstructionFileDetailed,
  parseMarkdownBuild,
  type InstructionFile,
  type PatcherEngine,
  type Severity,
  type UserSettings,
  type ValidationIssue,
} from "@modsync/core";

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 2,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export interface DirectoryFlags {
  mods?: string;
  kotor?: string;
  settings?: string;
  engine?: string;
  spoilerFree?: boolean;
  platform?: string;
  compat?: string;
}

/** Settings file (or defaults) with CLI flags applied on top. */
export async function settingsFromFlags(flags: DirectoryFlags, opts: { requireDirs?: boolean } = {}): Promise<UserSettings> {
  const settings = await loadSettings(flags.settings ? resolvePath(flags.settings) : undefined);
  if (flags.mods) settings.modDirectory = resolvePath(flags.mods);
  if (flags.kotor) settings.kotorDirectory = resolvePath(flags.kotor);
  if (flags.engine) {
    const engine = PATCHER_ENGINES.find((e) => e.toLowerCase() === flags.engine!.toLowerCase());
    if (!engine) throw new CliError(`--engine must be one of ${PATCHER_ENGINES.map((e) => e.toLowerCase()).join(", ")}`);
    settings.patcherEngine = engine as PatcherEngine;
  }
  if (flags.spoilerFree !== undefined) settings.spoilerFree = flags.spoilerFree;
  if (flags.platform) {
    const p = flags.platform.toLowerCase();
    if (p !== "pc" && p !== "mobile") throw new CliError("--platform must be pc or mobile");
    settings.platform = p === "pc" ? "PC" : "Mobile";
  }
  if (flags.compat) {
    const c = flags.compat.toLowerCase();
    const level = (["Compatible", "Untested", "Incompatible"] as const).find((l) => l.toLowerCase() === c);
    if (!level) throw new CliError("--compat must be compatible, untested or incompatible");
    settings.compatibilityLevel = level;
  }
  if (opts.requireDirs !== false) {
    if (!settings.modDirectory) throw new CliError("mod directory is not set: pass --mods <dir> (or save it in settings)");
    if (!settings.kotorDirectory) throw new CliError("KOTOR directory is not set: pass --kotor <dir> (or save it in settings)");
  }
  return settings;
}

export interface LoadedInstructionFile {
  file: InstructionFile;
  warnings: string[];
  path: string;
  kind: "toml" | "markdown";
}

/** Read a `.toml` (or `.md`) instruction file from disk. */
export async function readInstructionFile(path: string): Promise<LoadedInstructionFile> {
  const abs = resolvePath(path);
  let text: string;
  try {
    text = await readFile(abs, "utf8");
  } catch (err) {
    throw new CliError(`Cannot read ${abs}: ${(err as Error).message}`);
  }
  const ext = extname(abs).toLowerCase();
  try {
    if (ext === ".md" || ext === ".markdown") {
      const res = parseMarkdownBuild(text, { sourceUrl: abs });
      return { file: res.file, warnings: res.warnings, path: abs, kind: "markdown" };
    }
    const res = parseInstructionFileDetailed(text);
    return { file: res.file, warnings: res.warnings, path: abs, kind: "toml" };
  } catch (err) {
    throw new CliError(`${abs}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function writeTextFile(path: string, text: string): Promise<string> {
  const abs = resolvePath(path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, "utf8");
  return abs;
}

/** Parse `--select a,b,c` (repeatable) into lowercase GUIDs. */
export function parseGuidList(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  const out = values
    .flatMap((v) => v.split(","))
    .map((s) => s.trim().replace(/^\{|\}$/g, "").toLowerCase())
    .filter(Boolean);
  return out.length ? out : undefined;
}

/**
 * Apply selection flags: `--select` selects exactly the given mods,
 * `--all-essential` selects every Essential mod, `--all` every mod. Without
 * flags the file's own `IsSelected` values are used.
 */
export function applySelectionFlags(file: InstructionFile, flags: { select?: string[]; allEssential?: boolean; all?: boolean }): void {
  const select = parseGuidList(flags.select);
  if (!select && !flags.allEssential && !flags.all) return;
  const wanted = new Set(select ?? []);
  for (const mod of file.mods) {
    let on = wanted.has(mod.guid);
    if (flags.allEssential && mod.tier === "Essential") on = true;
    if (flags.all) on = true;
    mod.isSelected = on;
  }
  if (select) {
    const known = new Set(file.mods.flatMap((m) => [m.guid, ...m.options.map((o) => o.guid)]));
    for (const g of select) if (!known.has(g)) throw new CliError(`--select: unknown GUID ${g}`);
    // Selecting an option GUID also turns on its parent and the option.
    for (const mod of file.mods) {
      for (const option of mod.options) {
        if (wanted.has(option.guid)) {
          mod.isSelected = true;
          option.isSelected = true;
        }
      }
    }
  }
}

const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

/** Group issues by severity (errors first). */
export function groupIssues(issues: ValidationIssue[]): Array<{ severity: Severity; issues: ValidationIssue[] }> {
  return SEVERITY_ORDER.map((severity) => ({ severity, issues: issues.filter((i) => i.severity === severity) })).filter((g) => g.issues.length > 0);
}

export function formatIssue(issue: ValidationIssue, names: Map<string, string>): string {
  const where = issue.modGuid ? names.get(issue.modGuid) ?? issue.modGuid : undefined;
  const parts = [`[${issue.code}]`];
  if (where) parts.push(`${where}:`);
  parts.push(issue.message);
  if (issue.path && !issue.message.includes(issue.path)) parts.push(`(${issue.path})`);
  return parts.join(" ");
}

export function printIssues(issues: ValidationIssue[], file: InstructionFile, out: (line: string) => void): void {
  const names = new Map<string, string>();
  for (const mod of file.mods) {
    names.set(mod.guid, mod.name);
    for (const o of mod.options) names.set(o.guid, `${mod.name} / ${o.name}`);
  }
  if (issues.length === 0) {
    out("No issues.");
    return;
    }
  for (const group of groupIssues(issues)) {
    out(`${group.severity.toUpperCase()} (${group.issues.length})`);
    for (const issue of group.issues) out(`  ${formatIssue(issue, names)}`);
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m${Math.round(s - m * 60)}s`;
}
