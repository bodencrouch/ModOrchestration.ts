import { describe, expect, it } from "vitest";

import { buildDependencyGraph } from "./graph.js";
import { computeInstallOrder } from "./order.js";
import { computeSelection } from "./selection.js";
import { G, file, mod, option } from "./testing.js";

const settings = { spoilerFree: false, platform: "PC" as const };

function orderOf(f: ReturnType<typeof file>) {
  const sel = computeSelection(f, settings);
  return computeInstallOrder(f, sel);
}

describe("computeInstallOrder", () => {
  it("keeps file order when there are no constraints", () => {
    const f = file([mod(3), mod(1), mod(2)]);
    expect(orderOf(f).order).toEqual([G(3), G(1), G(2)]);
  });

  it("honours InstallAfter and InstallBefore in both directions", () => {
    const f = file([mod(1, { installAfter: [G(3)] }), mod(2, { installBefore: [G(1)] }), mod(3)]);
    const r = orderOf(f);
    expect(r.issues).toEqual([]);
    const pos = (g: string) => r.order.indexOf(g);
    expect(pos(G(3))).toBeLessThan(pos(G(1)));
    expect(pos(G(2))).toBeLessThan(pos(G(1)));
    // 2 and 3 have no relation: tie broken by file index -> 2 first.
    expect(r.order).toEqual([G(2), G(3), G(1)]);
  });

  it("breaks ties by file index (stable)", () => {
    const f = file([mod(5), mod(4, { installAfter: [G(5)] }), mod(3), mod(2, { installAfter: [G(3)] }), mod(1)]);
    expect(orderOf(f).order).toEqual([G(5), G(4), G(3), G(2), G(1)]);
  });

  it("ignores constraints towards unselected mods and warns for unknown GUIDs", () => {
    const f = file([mod(1, { installAfter: [G(2), G(99)] }), mod(2, { isSelected: false })]);
    const r = orderOf(f);
    expect(r.order).toEqual([G(1)]);
    expect(r.issues.map((i) => i.code)).toEqual(["unknown-guid"]);
    expect(r.issues[0].severity).toBe("warning");
  });

  it("detects cycles and names the mods", () => {
    const f = file([mod(1, { installAfter: [G(2)] }), mod(2, { installAfter: [G(3)] }), mod(3, { installAfter: [G(1)] }), mod(4)]);
    const r = orderOf(f);
    const cycle = r.issues.find((i) => i.code === "cycle");
    expect(cycle?.severity).toBe("error");
    expect(cycle?.message).toContain("Mod 1");
    expect(cycle?.message).toContain("Mod 2");
    expect(cycle?.message).toContain("Mod 3");
    expect(r.order).toHaveLength(4);
    expect(r.order[0]).toBe(G(4));
  });

  it("applies option ordering constraints to the parent mod", () => {
    const f = file([
      mod(1, { options: [option(11, { installAfter: [G(2)] })] }),
      mod(2),
      mod(3, { options: [option(31, { isSelected: false, installBefore: [G(1)] })] }),
    ]);
    const r = orderOf(f);
    expect(r.order).toEqual([G(2), G(1), G(3)]);
  });

  it("targets an option GUID through its parent mod", () => {
    const f = file([mod(1, { installAfter: [G(21)] }), mod(2, { options: [option(21)] })]);
    expect(orderOf(f).order).toEqual([G(2), G(1)]);
  });

  it("warns when a dependency installs after its dependent", () => {
    const f = file([mod(1, { dependencies: [G(2)] }), mod(2)]);
    const r = orderOf(f);
    expect(r.order).toEqual([G(1), G(2)]);
    expect(r.issues.map((i) => i.code)).toEqual(["dependency-after-dependent"]);
    expect(r.issues[0].severity).toBe("warning");
  });

  it("respects every edge on random DAGs", () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let round = 0; round < 40; round++) {
      const n = 3 + Math.floor(rnd() * 12);
      // Random permutation defines a hidden topological order so the graph is acyclic.
      const perm = [...Array(n).keys()].sort(() => rnd() - 0.5);
      const mods = [...Array(n).keys()].map((i) => mod(i + 1));
      const edges: Array<[number, number]> = [];
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          if (rnd() < 0.25) {
            const from = perm[a];
            const to = perm[b];
            edges.push([from, to]);
            if (rnd() < 0.5) mods[to].installAfter.push(G(from + 1));
            else mods[from].installBefore.push(G(to + 1));
          }
        }
      }
      const r = orderOf(file(mods));
      expect(r.issues.filter((i) => i.code === "cycle")).toEqual([]);
      expect(new Set(r.order).size).toBe(n);
      for (const [from, to] of edges) {
        expect(r.order.indexOf(G(from + 1))).toBeLessThan(r.order.indexOf(G(to + 1)));
      }
    }
  });
});

describe("buildDependencyGraph", () => {
  it("lists nodes for mods and options and typed edges", () => {
    const f = file([
      mod(1, { dependencies: [G(2)], restrictions: [G(3)], untestedWith: [G(4)], options: [option(11, { installAfter: [G(2)] })] }),
      mod(2, { installBefore: [G(1)] }),
      mod(3),
      mod(4, { installAfter: [G(99)] }),
    ]);
    const g = buildDependencyGraph(f);
    expect(g.nodes.map((n) => n.id)).toEqual([G(1), G(11), G(2), G(3), G(4)]);
    expect(g.nodes[1]).toMatchObject({ kind: "option", parent: G(1) });
    expect(g.edges).toContainEqual({ from: G(1), to: G(2), kind: "dependency" });
    expect(g.edges).toContainEqual({ from: G(1), to: G(3), kind: "restriction" });
    expect(g.edges).toContainEqual({ from: G(1), to: G(4), kind: "untested" });
    expect(g.edges).toContainEqual({ from: G(11), to: G(2), kind: "installAfter" });
    expect(g.edges).toContainEqual({ from: G(2), to: G(1), kind: "installBefore" });
    expect(g.unknown).toEqual([{ from: G(4), to: G(99), kind: "installAfter" }]);
  });
});
