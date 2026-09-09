/**
 * Install ordering: Kahn's algorithm over the selected mods with a min-heap
 * keyed by file index, so ties always resolve to file order and the result
 * is deterministic. Ordering constraints on options apply to their parent mod.
 */

import type { Guid, InstructionFile, ModComponent, ValidationIssue } from "../model/types.js";
import { indexFile, type SelectionSet } from "./selection.js";

export interface InstallOrderResult {
  order: Guid[];
  issues: ValidationIssue[];
}

/** Minimal binary min-heap over numbers. */
class MinHeap {
  private readonly data: number[] = [];

  get size(): number {
    return this.data.length;
  }

  push(v: number): void {
    const d = this.data;
    d.push(v);
    let i = d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (d[p] <= d[i]) break;
      [d[p], d[i]] = [d[i], d[p]];
      i = p;
    }
  }

  pop(): number {
    const d = this.data;
    const top = d[0];
    const last = d.pop()!;
    if (d.length > 0) {
      d[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < d.length && d[l] < d[m]) m = l;
        if (r < d.length && d[r] < d[m]) m = r;
        if (m === i) break;
        [d[m], d[i]] = [d[i], d[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Find one directed cycle among `nodes` using the adjacency lists; returns the node indices on it. */
function findCycle(nodes: number[], adj: Map<number, Set<number>>): number[] {
  const state = new Map<number, 0 | 1 | 2>();
  const stack: number[] = [];
  let found: number[] | undefined;
  const visit = (n: number): void => {
    if (found) return;
    state.set(n, 1);
    stack.push(n);
    for (const next of adj.get(n) ?? []) {
      if (found) return;
      const s = state.get(next) ?? 0;
      if (s === 0) visit(next);
      else if (s === 1) {
        found = stack.slice(stack.indexOf(next));
        return;
      }
    }
    stack.pop();
    state.set(n, 2);
  };
  for (const n of nodes) {
    if ((state.get(n) ?? 0) === 0) visit(n);
    if (found) break;
  }
  return found ?? nodes;
}

/**
 * Compute the install order of the selected mods.
 *
 * Edges come from `installAfter` / `installBefore` on mods and on selected
 * options (applied to the parent mod). Targets that exist but are not
 * selected are ignored; targets that do not exist in the file at all produce
 * an `unknown-guid` warning. A cycle produces an error issue `cycle` naming
 * the mods on it; the returned order then lists the acyclic prefix followed
 * by the remaining mods in file order.
 *
 * Additionally `dependency-after-dependent` warns when a dependency lands
 * after the mod that depends on it (does not fail).
 */
export function computeInstallOrder(file: InstructionFile, sel: SelectionSet): InstallOrderResult {
  const issues: ValidationIssue[] = [];
  const { options: optionIndex } = indexFile(file);
  const selectedMods = sel.mods;
  const indexOf = new Map<Guid, number>();
  selectedMods.forEach((m, i) => indexOf.set(m.guid, i));

  /** Selected mod index that owns a GUID (a mod itself or an option's parent), or undefined. */
  const ownerIndex = (guid: Guid): number | undefined => {
    const direct = indexOf.get(guid);
    if (direct !== undefined) return direct;
    const entry = optionIndex.get(guid);
    if (entry && sel.selectedGuids.has(guid)) return indexOf.get(entry.parent.guid);
    return undefined;
  };

  const adj = new Map<number, Set<number>>();
  const indegree = new Array<number>(selectedMods.length).fill(0);
  const addEdge = (from: number, to: number): void => {
    if (from === to) return;
    let set = adj.get(from);
    if (!set) {
      set = new Set();
      adj.set(from, set);
    }
    if (set.has(to)) return;
    set.add(to);
    indegree[to]++;
  };

  const warnUnknown = (mod: ModComponent, guid: Guid, field: string, optionGuid?: Guid): void => {
    issues.push({
      severity: "warning",
      code: "unknown-guid",
      message: `"${mod.name}" ${field} references unknown GUID ${guid}`,
      modGuid: mod.guid,
      optionGuid,
    });
  };

  selectedMods.forEach((mod, i) => {
    const sources: Array<{ after: Guid[]; before: Guid[]; optionGuid?: Guid }> = [
      { after: mod.installAfter, before: mod.installBefore },
    ];
    for (const option of mod.options) {
      if (sel.selectedGuids.has(option.guid)) {
        sources.push({ after: option.installAfter, before: option.installBefore, optionGuid: option.guid });
      }
    }
    for (const src of sources) {
      for (const g of src.after) {
        if (!sel.names.has(g)) {
          warnUnknown(mod, g, "InstallAfter", src.optionGuid);
          continue;
        }
        const t = ownerIndex(g);
        if (t !== undefined) addEdge(t, i);
      }
      for (const g of src.before) {
        if (!sel.names.has(g)) {
          warnUnknown(mod, g, "InstallBefore", src.optionGuid);
          continue;
        }
        const t = ownerIndex(g);
        if (t !== undefined) addEdge(i, t);
      }
    }
  });

  const heap = new MinHeap();
  indegree.forEach((d, i) => {
    if (d === 0) heap.push(i);
  });
  const orderIdx: number[] = [];
  const remaining = [...indegree];
  while (heap.size > 0) {
    const n = heap.pop();
    orderIdx.push(n);
    for (const next of adj.get(n) ?? []) {
      if (--remaining[next] === 0) heap.push(next);
    }
  }

  if (orderIdx.length < selectedMods.length) {
    const placed = new Set(orderIdx);
    const leftover = selectedMods.map((_, i) => i).filter((i) => !placed.has(i));
    const cycle = findCycle(leftover, adj);
    const names = cycle.map((i) => `"${selectedMods[i].name}"`);
    issues.push({
      severity: "error",
      code: "cycle",
      message: `Install order cycle: ${names.join(" -> ")} -> ${names[0]}`,
      modGuid: selectedMods[cycle[0]].guid,
    });
    orderIdx.push(...leftover);
  }

  const order = orderIdx.map((i) => selectedMods[i].guid);
  const position = new Map<Guid, number>();
  order.forEach((g, i) => position.set(g, i));

  for (const mod of selectedMods) {
    const deps: Array<{ guids: Guid[]; optionGuid?: Guid; label: string }> = [
      { guids: mod.dependencies, label: `"${mod.name}"` },
    ];
    for (const option of mod.options) {
      if (sel.selectedGuids.has(option.guid)) {
        deps.push({ guids: option.dependencies, optionGuid: option.guid, label: `Option "${option.name}" of "${mod.name}"` });
      }
    }
    for (const d of deps) {
      for (const g of d.guids) {
        const t = ownerIndex(g);
        if (t === undefined) continue;
        const depGuid = selectedMods[t].guid;
        if (depGuid === mod.guid) continue;
        if ((position.get(depGuid) ?? 0) > (position.get(mod.guid) ?? 0)) {
          issues.push({
            severity: "warning",
            code: "dependency-after-dependent",
            message: `${d.label} depends on "${sel.names.get(g) ?? g}", which installs after it`,
            modGuid: mod.guid,
            optionGuid: d.optionGuid,
          });
        }
      }
    }
  }

  return { order, issues };
}
