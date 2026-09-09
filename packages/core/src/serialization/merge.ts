/**
 * Merge a freshly imported instruction file into an existing one, keeping the
 * hand-written instructions of the existing file.
 */
import { isGuid } from "../model/guid.js";
import type { Guid, Instruction, InstructionFile, ModComponent, ModOption } from "../model/types.js";
import { normalizeNameForGuid } from "./markdown/stableGuid.js";

export interface MergeConflict {
  guid: Guid;
  name: string;
  /** Field that differs and was kept from the existing file. */
  field: "instructions" | "options";
  existing: unknown;
  incoming: unknown;
}

export interface MergeResult {
  file: InstructionFile;
  added: Guid[];
  updated: Guid[];
  removed: Guid[];
  conflicts: MergeConflict[];
}

const DOC_FIELDS = [
  "name",
  "description",
  "directions",
  "authors",
  "modLink",
  "expectedFiles",
  "expectedHashes",
  "category",
  "tier",
  "language",
  "installationMethod",
  "usageWarnings",
  "headingLevel",
  "images",
] as const;
const FLAG_FIELDS = ["fullBuildOnly", "isWidescreen", "aspyrOnly", "isPatch"] as const;
const REL_FIELDS = ["dependencies", "restrictions", "installAfter", "installBefore", "untestedWith"] as const;

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  if (v === "Unknown") return true;
  return false;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stripInstruction(i: Instruction): Omit<Instruction, "guid"> {
  const { guid: _guid, ...rest } = i;
  return rest;
}

function stripOption(o: ModOption): unknown {
  const { guid: _guid, instructions, ...rest } = o;
  return { ...rest, instructions: instructions.map(stripInstruction) };
}

function remapGuids(list: Guid[], map: Map<Guid, Guid>): Guid[] {
  const out: Guid[] = [];
  for (const g of list) {
    const m = map.get(g) ?? g;
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

function remapMod(mod: ModComponent, map: Map<Guid, Guid>): ModComponent {
  const remapInstr = (i: Instruction): Instruction => ({
    ...i,
    dependencies: remapGuids(i.dependencies, map),
    restrictions: remapGuids(i.restrictions, map),
    source: i.action === "Choose" ? i.source.map((s) => (isGuid(s) ? (map.get(s) ?? s) : s)) : [...i.source],
  });
  return {
    ...mod,
    guid: map.get(mod.guid) ?? mod.guid,
    dependencies: remapGuids(mod.dependencies, map),
    restrictions: remapGuids(mod.restrictions, map),
    installAfter: remapGuids(mod.installAfter, map),
    installBefore: remapGuids(mod.installBefore, map),
    untestedWith: remapGuids(mod.untestedWith, map),
    instructions: mod.instructions.map(remapInstr),
    options: mod.options.map((o) => ({
      ...o,
      dependencies: remapGuids(o.dependencies, map),
      restrictions: remapGuids(o.restrictions, map),
      installAfter: remapGuids(o.installAfter, map),
      installBefore: remapGuids(o.installBefore, map),
      instructions: o.instructions.map(remapInstr),
    })),
  };
}

/**
 * Merge `incoming` (e.g. a re-imported guide) into `existing`. Mods are matched
 * by GUID, then by normalized name. Doc fields come from incoming, relationship
 * lists are unioned, and existing instructions/options win unless the existing
 * mod has none. Mods missing from incoming are removed; the incoming order is kept.
 */
export function mergeInstructionFiles(existing: InstructionFile, incoming: InstructionFile): MergeResult {
  const byGuid = new Map<Guid, ModComponent>();
  const byName = new Map<string, ModComponent>();
  for (const mod of existing.mods) {
    byGuid.set(mod.guid, mod);
    const key = normalizeNameForGuid(mod.name);
    if (key && !byName.has(key)) byName.set(key, mod);
  }

  // First pass: match and build the incoming -> existing GUID remap.
  const matches = new Map<ModComponent, ModComponent | undefined>();
  const guidMap = new Map<Guid, Guid>();
  const claimed = new Set<Guid>();
  for (const inc of incoming.mods) {
    let match = byGuid.get(inc.guid);
    if (!match || claimed.has(match.guid)) {
      const byNameHit = byName.get(normalizeNameForGuid(inc.name));
      match = byNameHit && !claimed.has(byNameHit.guid) ? byNameHit : undefined;
    }
    if (match) {
      claimed.add(match.guid);
      if (match.guid !== inc.guid) guidMap.set(inc.guid, match.guid);
      // Options matched by name inherit the existing option GUIDs too.
      for (const opt of inc.options) {
        const eo = match.options.find((o) => normalizeNameForGuid(o.name) === normalizeNameForGuid(opt.name));
        if (eo && eo.guid !== opt.guid) guidMap.set(opt.guid, eo.guid);
      }
    }
    matches.set(inc, match);
  }

  const added: Guid[] = [];
  const updated: Guid[] = [];
  const conflicts: MergeConflict[] = [];
  const mods: ModComponent[] = [];

  for (const rawInc of incoming.mods) {
    const match = matches.get(rawInc);
    const inc = remapMod(rawInc, guidMap);
    if (!match) {
      mods.push(inc);
      added.push(inc.guid);
      continue;
    }
    const merged: ModComponent = { ...match };
    let changed = false;
    for (const field of DOC_FIELDS) {
      const value = inc[field];
      if (!isEmpty(value) && !same(value, match[field])) {
        (merged as unknown as Record<string, unknown>)[field] = value;
        changed = true;
      }
    }
    for (const field of FLAG_FIELDS) {
      if (inc[field] !== match[field]) {
        merged[field] = inc[field];
        changed = true;
      }
    }
    for (const field of REL_FIELDS) {
      const union = remapGuids([...match[field], ...inc[field]], guidMap);
      if (!same(union, match[field])) {
        merged[field] = union;
        changed = true;
      }
    }
    if (match.instructions.length === 0 && inc.instructions.length > 0) {
      merged.instructions = inc.instructions;
      changed = true;
    } else if (
      match.instructions.length > 0 &&
      inc.instructions.length > 0 &&
      !same(match.instructions.map(stripInstruction), inc.instructions.map(stripInstruction))
    ) {
      conflicts.push({ guid: match.guid, name: match.name, field: "instructions", existing: match.instructions, incoming: inc.instructions });
    }
    if (match.options.length === 0 && inc.options.length > 0) {
      merged.options = inc.options;
      changed = true;
    } else if (match.options.length > 0 && inc.options.length > 0 && !same(match.options.map(stripOption), inc.options.map(stripOption))) {
      conflicts.push({ guid: match.guid, name: match.name, field: "options", existing: match.options, incoming: inc.options });
    }
    mods.push(merged);
    if (changed) updated.push(merged.guid);
  }

  const removed = existing.mods.filter((m) => !claimed.has(m.guid)).map((m) => m.guid);

  const config = { ...existing.config };
  for (const key of ["name", "beforeModListContent", "aspyrSectionContent", "widescreenSectionContent", "afterModListContent", "sourceUrl", "version", "author", "description"] as const) {
    const v = incoming.config[key];
    if (!isEmpty(v)) config[key] = v;
  }
  if (incoming.config.targetGame !== "Unknown") config.targetGame = incoming.config.targetGame;

  return { file: { config, mods }, added, updated, removed, conflicts };
}
