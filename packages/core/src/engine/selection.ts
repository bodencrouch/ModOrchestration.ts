/**
 * Selection: which mods and options take part in an install, and the
 * constraints (dependencies, restrictions, untested pairs, exclusive option
 * groups) that a selection must satisfy.
 *
 * Nothing here auto-selects. A mod whose dependency is unselected is a
 * constraint error; `resolveDependencyClosure` tells the UI what it would
 * have to add so it can offer that to the user.
 */

import type {
  CompatibilityLevel,
  Guid,
  InstructionFile,
  ModComponent,
  ModOption,
  Tier,
  UserSettings,
  ValidationIssue,
} from "../model/types.js";

export interface SelectionSet {
  /** GUIDs of every selected mod and every selected option (of selected mods). */
  selectedGuids: Set<Guid>;
  /** Selected mods, in file order, after spoiler-free / platform filtering. */
  mods: ModComponent[];
  /** Selected options keyed by GUID (only options of selected mods). */
  options: Map<Guid, ModOption>;
  /** Display name for every mod and option GUID in the file (selected or not). */
  names: Map<Guid, string>;
}

/** The subset of settings that influences the selection. */
export type SelectionSettings = Pick<UserSettings, "spoilerFree" | "platform">;

/** Index every mod and option of a file by GUID. */
export function indexFile(file: InstructionFile): {
  mods: Map<Guid, ModComponent>;
  options: Map<Guid, { option: ModOption; parent: ModComponent }>;
  names: Map<Guid, string>;
} {
  const mods = new Map<Guid, ModComponent>();
  const options = new Map<Guid, { option: ModOption; parent: ModComponent }>();
  const names = new Map<Guid, string>();
  for (const mod of file.mods) {
    if (!mods.has(mod.guid)) mods.set(mod.guid, mod);
    names.set(mod.guid, mod.name);
    for (const option of mod.options) {
      if (!options.has(option.guid)) options.set(option.guid, { option, parent: mod });
      names.set(option.guid, option.name);
    }
  }
  return { mods, options, names };
}

/** True when the mod is part of the build under the given settings (before looking at isSelected). */
export function isModAvailable(mod: ModComponent, settings: SelectionSettings): boolean {
  if (settings.spoilerFree && mod.fullBuildOnly) return false;
  if (mod.aspyrOnly && settings.platform !== "Mobile") return false;
  return true;
}

/**
 * Compute the selection set from the `isSelected` flags of the file, applying
 * spoiler-free (drops `fullBuildOnly` mods) and platform (`aspyrOnly` mods
 * only on Mobile) filtering. Options count only when their parent is selected.
 */
export function computeSelection(file: InstructionFile, settings: SelectionSettings): SelectionSet {
  const { names } = indexFile(file);
  const selectedGuids = new Set<Guid>();
  const mods: ModComponent[] = [];
  const options = new Map<Guid, ModOption>();
  for (const mod of file.mods) {
    if (!mod.isSelected || !isModAvailable(mod, settings)) continue;
    mods.push(mod);
    selectedGuids.add(mod.guid);
    for (const option of mod.options) {
      if (!option.isSelected) continue;
      selectedGuids.add(option.guid);
      options.set(option.guid, option);
    }
  }
  return { selectedGuids, mods, options, names };
}

export function isSelected(sel: SelectionSet, guid: Guid): boolean {
  return sel.selectedGuids.has(guid);
}

function listNames(sel: SelectionSet, guids: Guid[]): string {
  return guids.map((g) => `"${sel.names.get(g) ?? g}"`).join(", ");
}

/**
 * Check the selection against dependency / restriction / untested / exclusive
 * group constraints. Only GUIDs that exist in the file are considered here;
 * references to unknown GUIDs are reported by the validator (`unknown-guid`).
 */
export function checkSelectionConstraints(
  file: InstructionFile,
  sel: SelectionSet,
  level: CompatibilityLevel,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const known = (g: Guid): boolean => sel.names.has(g);

  for (const mod of sel.mods) {
    const missing = mod.dependencies.filter((g) => known(g) && !sel.selectedGuids.has(g));
    if (missing.length) {
      issues.push({
        severity: "error",
        code: "dependency-missing",
        message: `"${mod.name}" requires ${listNames(sel, missing)} to be selected`,
        modGuid: mod.guid,
      });
    }
    const restricted = mod.restrictions.filter((g) => sel.selectedGuids.has(g));
    if (restricted.length) {
      issues.push({
        severity: "error",
        code: "restriction-selected",
        message: `"${mod.name}" cannot be installed together with ${listNames(sel, restricted)}`,
        modGuid: mod.guid,
      });
    }
    const untested = mod.untestedWith.filter((g) => sel.selectedGuids.has(g));
    if (untested.length) {
      const allowed = level !== "Compatible";
      issues.push({
        severity: allowed ? "warning" : "error",
        code: "untested-pair",
        message: allowed
          ? `"${mod.name}" is untested together with ${listNames(sel, untested)}`
          : `"${mod.name}" is untested together with ${listNames(sel, untested)}; raise the compatibility level to "Untested" to allow it`,
        modGuid: mod.guid,
      });
    }

    const groups = new Map<string, ModOption[]>();
    for (const option of mod.options) {
      if (!sel.selectedGuids.has(option.guid)) continue;
      const missingOpt = option.dependencies.filter((g) => known(g) && !sel.selectedGuids.has(g));
      if (missingOpt.length) {
        issues.push({
          severity: "error",
          code: "dependency-missing",
          message: `Option "${option.name}" of "${mod.name}" requires ${listNames(sel, missingOpt)} to be selected`,
          modGuid: mod.guid,
          optionGuid: option.guid,
        });
      }
      const restrictedOpt = option.restrictions.filter((g) => sel.selectedGuids.has(g));
      if (restrictedOpt.length) {
        issues.push({
          severity: "error",
          code: "restriction-selected",
          message: `Option "${option.name}" of "${mod.name}" cannot be selected together with ${listNames(sel, restrictedOpt)}`,
          modGuid: mod.guid,
          optionGuid: option.guid,
        });
      }
      if (option.exclusiveGroup) {
        const key = option.exclusiveGroup.trim().toLowerCase();
        const list = groups.get(key) ?? [];
        list.push(option);
        groups.set(key, list);
      }
    }
    for (const [group, members] of groups) {
      if (members.length < 2) continue;
      issues.push({
        severity: "error",
        code: "exclusive-group",
        message: `"${mod.name}": only one option of group "${group}" may be selected (${members
          .map((o) => `"${o.name}"`)
          .join(", ")})`,
        modGuid: mod.guid,
        optionGuid: members[0].guid,
      });
    }
  }
  void file;
  return issues;
}

/**
 * Mutate a file's `isSelected` flags. Selecting an option also selects its
 * parent and deselects other options of the same exclusive group. Deselecting
 * a mod leaves its option flags alone (they are ignored while the parent is
 * off). Returns the GUIDs whose flag changed.
 */
export function applySelection(
  file: InstructionFile,
  guid: Guid,
  selected: boolean,
  options?: Record<Guid, boolean>,
): Guid[] {
  const changed: Guid[] = [];
  const setFlag = (target: ModComponent | ModOption, value: boolean): void => {
    if (target.isSelected !== value) {
      target.isSelected = value;
      changed.push(target.guid);
    }
  };
  const applyOption = (mod: ModComponent, option: ModOption, value: boolean): void => {
    setFlag(option, value);
    if (!value || !option.exclusiveGroup) return;
    const key = option.exclusiveGroup.trim().toLowerCase();
    for (const other of mod.options) {
      if (other !== option && other.exclusiveGroup?.trim().toLowerCase() === key) setFlag(other, false);
    }
  };

  const { mods, options: optionIndex } = indexFile(file);
  const mod = mods.get(guid);
  if (mod) {
    setFlag(mod, selected);
    if (options) {
      for (const [optGuid, value] of Object.entries(options)) {
        const option = mod.options.find((o) => o.guid === optGuid);
        if (option) applyOption(mod, option, value);
      }
    }
    return changed;
  }
  const entry = optionIndex.get(guid);
  if (entry) {
    applyOption(entry.parent, entry.option, selected);
    if (selected) setFlag(entry.parent, true);
    return changed;
  }
  throw new Error(`Unknown GUID ${guid}`);
}

/**
 * Select exactly the mods whose tier is in `tiers` (everything else is
 * deselected). Option flags are left at their defaults. Returns the changed GUIDs.
 */
export function selectByTier(file: InstructionFile, tiers: Tier[]): Guid[] {
  const wanted = new Set(tiers);
  const changed: Guid[] = [];
  for (const mod of file.mods) {
    const value = wanted.has(mod.tier);
    if (mod.isSelected !== value) {
      mod.isSelected = value;
      changed.push(mod.guid);
    }
  }
  return changed;
}

/**
 * GUIDs that would have to be selected (transitively) for every GUID in
 * `guids` to have its dependencies satisfied, given the file's current
 * `isSelected` flags. Includes the parent mod of any option dependency.
 * The input GUIDs themselves are included when they are not selected.
 * Unknown GUIDs are skipped.
 */
export function resolveDependencyClosure(file: InstructionFile, guids: Guid[]): Guid[] {
  const { mods, options } = indexFile(file);
  const out: Guid[] = [];
  const seen = new Set<Guid>();
  const stack = [...guids];
  const currentlySelected = (g: Guid): boolean => {
    const mod = mods.get(g);
    if (mod) return mod.isSelected;
    const entry = options.get(g);
    return entry ? entry.parent.isSelected && entry.option.isSelected : false;
  };
  while (stack.length) {
    const g = stack.pop()!;
    if (seen.has(g)) continue;
    seen.add(g);
    const mod = mods.get(g);
    const entry = options.get(g);
    if (!mod && !entry) continue;
    if (!currentlySelected(g)) out.push(g);
    const deps = mod ? mod.dependencies : entry!.option.dependencies;
    for (const d of deps) stack.push(d);
    if (entry) stack.push(entry.parent.guid);
  }
  // Keep file order for a stable answer.
  const order = new Map<Guid, number>();
  let i = 0;
  for (const mod of file.mods) {
    order.set(mod.guid, i++);
    for (const o of mod.options) order.set(o.guid, i++);
  }
  return out.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}
