/**
 * SVG dependency graph. Layout: longest-path layering (Kahn over a DAG made
 * acyclic by dropping back edges found with a DFS), nodes ordered inside a
 * layer by the barycenter of their predecessors. No external library.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { reportError } from "../state/store";
import type { GraphEdge, GraphEdgeKind, GraphNode, GraphResult, Guid } from "../types";

export const EDGE_COLORS: Record<GraphEdgeKind, string> = {
  dependency: "#4f9cff",
  restriction: "#ff5c5c",
  installAfter: "#3ecf8e",
  installBefore: "#f5b942",
  untested: "#b57bff",
};

const EDGE_LABELS: Record<GraphEdgeKind, string> = {
  dependency: "depends on",
  restriction: "conflicts with",
  installAfter: "installs after",
  installBefore: "installs before",
  untested: "untested with",
};

interface Positioned {
  node: GraphNode;
  x: number;
  y: number;
  layer: number;
}

const NODE_W = 180;
const NODE_H = 44;
const GAP_X = 90;
const GAP_Y = 24;

function layout(graph: GraphResult): { nodes: Positioned[]; width: number; height: number } {
  const ids = graph.nodes.map((n) => n.id);
  const idSet = new Set(ids);
  // Directed edges for layering: "to" must come before "from" (dependency, installAfter),
  // "from" before "to" (installBefore). Restriction/untested are undirected and ignored.
  const succ = new Map<Guid, Set<Guid>>();
  for (const id of ids) succ.set(id, new Set());
  for (const e of graph.edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to) || e.from === e.to) continue;
    if (e.kind === "dependency" || e.kind === "installAfter") succ.get(e.to)!.add(e.from);
    else if (e.kind === "installBefore") succ.get(e.from)!.add(e.to);
  }
  // Remove back edges (DFS) so cycles don't hang the layering.
  const color = new Map<Guid, 0 | 1 | 2>();
  const visit = (u: Guid) => {
    color.set(u, 1);
    for (const v of [...succ.get(u)!]) {
      const c = color.get(v) ?? 0;
      if (c === 1) succ.get(u)!.delete(v);
      else if (c === 0) visit(v);
    }
    color.set(u, 2);
  };
  for (const id of ids) if (!color.get(id)) visit(id);
  // Longest path layering.
  const indeg = new Map<Guid, number>(ids.map((id) => [id, 0]));
  for (const [, vs] of succ) for (const v of vs) indeg.set(v, indeg.get(v)! + 1);
  const layer = new Map<Guid, number>();
  const queue = ids.filter((id) => indeg.get(id) === 0);
  for (const id of queue) layer.set(id, 0);
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of succ.get(u)!) {
      layer.set(v, Math.max(layer.get(v) ?? 0, layer.get(u)! + 1));
      indeg.set(v, indeg.get(v)! - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }
  for (const id of ids) if (!layer.has(id)) layer.set(id, 0);
  const layers: Guid[][] = [];
  for (const id of ids) {
    const l = layer.get(id)!;
    (layers[l] ??= []).push(id);
  }
  // Barycenter ordering.
  const pred = new Map<Guid, Guid[]>(ids.map((id) => [id, []]));
  for (const [u, vs] of succ) for (const v of vs) pred.get(v)!.push(u);
  const pos = new Map<Guid, number>();
  layers.forEach((ls, li) => {
    if (li > 0) {
      const bary = (id: Guid) => {
        const ps = pred.get(id)!;
        return ps.length ? ps.reduce((n, p) => n + (pos.get(p) ?? 0), 0) / ps.length : Number.MAX_SAFE_INTEGER;
      };
      ls.sort((a, b) => bary(a) - bary(b));
    }
    ls.forEach((id, i) => pos.set(id, i));
  });
  const maxRows = Math.max(1, ...layers.map((l) => l.length));
  const height = maxRows * (NODE_H + GAP_Y) + GAP_Y;
  const nodes: Positioned[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  layers.forEach((ls, li) => {
    const offset = (height - ls.length * (NODE_H + GAP_Y)) / 2;
    ls.forEach((id, i) => {
      nodes.push({ node: byId.get(id)!, layer: li, x: GAP_X / 2 + li * (NODE_W + GAP_X), y: offset + GAP_Y / 2 + i * (NODE_H + GAP_Y) });
    });
  });
  const width = Math.max(1, layers.length) * (NODE_W + GAP_X);
  return { nodes, width, height };
}

export interface DagViewProps {
  onSelect?: (guid: Guid) => void;
  selected?: Guid;
}

export function DagView({ onSelect, selected }: DagViewProps) {
  const [graph, setGraph] = useState<GraphResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const [kinds, setKinds] = useState<Record<GraphEdgeKind, boolean>>({ dependency: true, restriction: true, installAfter: true, installBefore: true, untested: true });

  useEffect(() => {
    let alive = true;
    api
      .getGraph()
      .then((g) => alive && setGraph(g))
      .catch((e) => reportError(e, "Loading the graph failed"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const laid = useMemo(() => (graph ? layout(graph) : null), [graph]);
  if (loading) return <div className="muted">Loading graph…</div>;
  if (!graph || !laid) return <div className="muted">No graph available. Load an instruction file first.</div>;
  if (graph.nodes.length === 0) return <div className="muted">The instruction file has no mods.</div>;

  const byId = new Map(laid.nodes.map((n) => [n.node.id, n]));
  const edgeDesc = (e: GraphEdge) => `${byId.get(e.from)?.node.name ?? e.from} ${EDGE_LABELS[e.kind]} ${byId.get(e.to)?.node.name ?? e.to}`;

  return (
    <div className="dag">
      <div className="dag-legend">
        {(Object.keys(EDGE_COLORS) as GraphEdgeKind[]).map((k) => (
          <label key={k} className="check small">
            <input type="checkbox" checked={kinds[k]} onChange={(e) => setKinds({ ...kinds, [k]: e.target.checked })} />
            <span className="legend-swatch" style={{ background: EDGE_COLORS[k] }} /> {EDGE_LABELS[k]}
          </label>
        ))}
      </div>
      <div className="dag-scroll">
        <svg width={laid.width} height={laid.height} viewBox={`0 0 ${laid.width} ${laid.height}`} className="dag-svg">
          <defs>
            {(Object.keys(EDGE_COLORS) as GraphEdgeKind[]).map((k) => (
              <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLORS[k]} />
              </marker>
            ))}
          </defs>
          {graph.edges
            .filter((e) => kinds[e.kind] && byId.has(e.from) && byId.has(e.to))
            .map((e, i) => {
              const a = byId.get(e.from)!;
              const b = byId.get(e.to)!;
              const leftToRight = a.x <= b.x;
              const x1 = leftToRight ? a.x + NODE_W : a.x;
              const x2 = leftToRight ? b.x : b.x + NODE_W;
              const y1 = a.y + NODE_H / 2;
              const y2 = b.y + NODE_H / 2;
              const dx = Math.max(40, Math.abs(x2 - x1) / 2);
              const d = `M ${x1} ${y1} C ${x1 + (leftToRight ? dx : -dx)} ${y1}, ${x2 - (leftToRight ? dx : -dx)} ${y2}, ${x2} ${y2}`;
              const undirected = e.kind === "restriction" || e.kind === "untested";
              const highlighted = selected && (e.from === selected || e.to === selected);
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={EDGE_COLORS[e.kind]}
                  strokeWidth={highlighted ? 3 : 1.5}
                  strokeDasharray={undirected ? "6 4" : undefined}
                  opacity={selected && !highlighted ? 0.25 : 0.9}
                  markerEnd={undirected ? undefined : `url(#arrow-${e.kind})`}
                  onMouseMove={(ev) => setHover({ x: ev.clientX, y: ev.clientY, text: edgeDesc(e) })}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          {laid.nodes.map((p) => (
            <g
              key={p.node.id}
              transform={`translate(${p.x}, ${p.y})`}
              className={`dag-node ${p.node.isSelected ? "selected" : ""} ${selected === p.node.id ? "current" : ""}`}
              onClick={() => onSelect?.(p.node.id)}
              onMouseMove={(ev) => setHover({ x: ev.clientX, y: ev.clientY, text: `${p.node.name}${p.node.tier ? ` · ${p.node.tier}` : ""}${p.node.isSelected ? " · selected" : ""}` })}
              onMouseLeave={() => setHover(null)}
            >
              <rect width={NODE_W} height={NODE_H} rx={8} />
              <text x={10} y={NODE_H / 2 + 1} dominantBaseline="middle">
                {p.node.name.length > 22 ? `${p.node.name.slice(0, 21)}…` : p.node.name}
              </text>
              {p.node.tier && (
                <text x={NODE_W - 8} y={NODE_H - 8} textAnchor="end" className="dag-tier">
                  {p.node.tier}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      {hover && (
        <div className="tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          {hover.text}
        </div>
      )}
    </div>
  );
}
