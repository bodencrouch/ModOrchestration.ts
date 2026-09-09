/**
 * Dependency graph for the DAG view. Every mod and option becomes a node;
 * every relationship becomes a typed edge. Edges to GUIDs that do not exist
 * in the file are reported in `unknown` instead of being drawn.
 */

import type { Guid, InstructionFile, Tier } from "../model/types.js";
import { indexFile } from "./selection.js";

export type GraphEdgeKind = "dependency" | "restriction" | "installAfter" | "installBefore" | "untested";

export interface GraphNode {
  id: Guid;
  name: string;
  kind: "mod" | "option";
  /** Parent mod for options. */
  parent?: Guid;
  isSelected: boolean;
  tier: Tier;
  isWidescreen: boolean;
}

export interface GraphEdge {
  from: Guid;
  to: Guid;
  kind: GraphEdgeKind;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** References to GUIDs that are not in the file. */
  unknown: Array<{ from: Guid; to: Guid; kind: GraphEdgeKind }>;
}

export function buildDependencyGraph(file: InstructionFile): DependencyGraph {
  const { names } = indexFile(file);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const unknown: DependencyGraph["unknown"] = [];
  const seenEdges = new Set<string>();

  const addEdge = (from: Guid, to: Guid, kind: GraphEdgeKind): void => {
    if (!names.has(to)) {
      unknown.push({ from, to, kind });
      return;
    }
    const key = `${kind}:${from}:${to}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push({ from, to, kind });
  };

  const addRelations = (
    id: Guid,
    rel: { dependencies: Guid[]; restrictions: Guid[]; installAfter: Guid[]; installBefore: Guid[]; untestedWith?: Guid[] },
  ): void => {
    for (const g of rel.dependencies) addEdge(id, g, "dependency");
    for (const g of rel.restrictions) addEdge(id, g, "restriction");
    for (const g of rel.installAfter) addEdge(id, g, "installAfter");
    for (const g of rel.installBefore) addEdge(id, g, "installBefore");
    for (const g of rel.untestedWith ?? []) addEdge(id, g, "untested");
  };

  for (const mod of file.mods) {
    nodes.push({
      id: mod.guid,
      name: mod.name,
      kind: "mod",
      isSelected: mod.isSelected,
      tier: mod.tier,
      isWidescreen: mod.isWidescreen,
    });
    addRelations(mod.guid, mod);
    for (const option of mod.options) {
      nodes.push({
        id: option.guid,
        name: option.name,
        kind: "option",
        parent: mod.guid,
        isSelected: mod.isSelected && option.isSelected,
        tier: mod.tier,
        isWidescreen: mod.isWidescreen,
      });
      addRelations(option.guid, option);
    }
  }
  return { nodes, edges, unknown };
}
