import type { ActionType, Guid, Instruction, InstructionFile, MainConfig, ModComponent, ModOption } from "../types";

export function newGuid(): Guid {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // RFC 4122 v4 fallback
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function blankInstruction(action: ActionType = "Extract"): Instruction {
  return { guid: newGuid(), action, source: [], overwrite: true, dependencies: [], restrictions: [] };
}

export function blankOption(): ModOption {
  return { guid: newGuid(), name: "New option", dependencies: [], restrictions: [], installAfter: [], installBefore: [], instructions: [], isSelected: false };
}

export function blankMod(): ModComponent {
  return {
    guid: newGuid(),
    name: "New mod",
    authors: [],
    modLink: [],
    category: [],
    tier: "Unknown",
    installationMethod: "Unknown",
    dependencies: [],
    restrictions: [],
    installAfter: [],
    installBefore: [],
    untestedWith: [],
    instructions: [],
    options: [],
    isSelected: false,
    installState: "NotInstalled",
    isDownloaded: false,
    fullBuildOnly: false,
    isWidescreen: false,
    aspyrOnly: false,
    isPatch: false,
  };
}

export function blankConfig(): MainConfig {
  return { targetGame: "Unknown", compatibilityLevel: "Compatible", patcherEngine: "Native", spoilerFree: false, platform: "PC" };
}

export function blankFile(): InstructionFile {
  return { config: blankConfig(), mods: [] };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function splitCommas(text: string): string[] {
  return text
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** All (guid, label) pairs in the file: mods and their options. */
export function guidChoices(file: InstructionFile, exclude?: Guid): Array<{ guid: Guid; label: string; isOption: boolean }> {
  const out: Array<{ guid: Guid; label: string; isOption: boolean }> = [];
  for (const m of file.mods) {
    if (m.guid !== exclude) out.push({ guid: m.guid, label: m.name || m.guid, isOption: false });
    for (const o of m.options) if (o.guid !== exclude) out.push({ guid: o.guid, label: `${m.name || m.guid} / ${o.name || o.guid}`, isOption: true });
  }
  return out;
}

/** Turn an absolute path into a placeholder path using the configured directories. */
export function toPlaceholder(path: string, dirs: { modDirectory: string; kotorDirectory: string }): string {
  const norm = path.replace(/\\/g, "/");
  const tryRoot = (root: string, ph: string) => {
    if (!root) return undefined;
    const r = root.replace(/\\/g, "/").replace(/\/+$/, "");
    if (norm.toLowerCase() === r.toLowerCase()) return ph;
    if (norm.toLowerCase().startsWith(r.toLowerCase() + "/")) return `${ph}${norm.slice(r.length)}`;
    return undefined;
  };
  return tryRoot(dirs.modDirectory, "<<modDirectory>>") ?? tryRoot(dirs.kotorDirectory, "<<kotorDirectory>>") ?? norm;
}
