import { describe, expect, it } from "vitest";

import {
  applySelection,
  checkSelectionConstraints,
  computeSelection,
  isSelected,
  resolveDependencyClosure,
  selectByTier,
} from "./selection.js";
import { G, file, mod, option } from "./testing.js";

const pc = { spoilerFree: false, platform: "PC" as const };

describe("computeSelection", () => {
  it("collects selected mods and their selected options", () => {
    const f = file([mod(1, { options: [option(11), option(12, { isSelected: false })] }), mod(2, { isSelected: false, options: [option(21)] })]);
    const sel = computeSelection(f, pc);
    expect([...sel.selectedGuids]).toEqual([G(1), G(11)]);
    expect(sel.mods.map((m) => m.guid)).toEqual([G(1)]);
    expect([...sel.options.keys()]).toEqual([G(11)]);
    expect(sel.names.get(G(21))).toBe("Option 21");
    expect(isSelected(sel, G(11))).toBe(true);
    expect(isSelected(sel, G(21))).toBe(false);
  });

  it("applies spoiler-free and platform filters", () => {
    const f = file([mod(1, { fullBuildOnly: true }), mod(2, { aspyrOnly: true }), mod(3)]);
    expect(computeSelection(f, pc).mods.map((m) => m.guid)).toEqual([G(1), G(3)]);
    expect(computeSelection(f, { spoilerFree: true, platform: "PC" }).mods.map((m) => m.guid)).toEqual([G(3)]);
    expect(computeSelection(f, { spoilerFree: false, platform: "Mobile" }).mods.map((m) => m.guid)).toEqual([G(1), G(2), G(3)]);
  });
});

describe("checkSelectionConstraints", () => {
  it("reports a missing dependency instead of auto-selecting", () => {
    const f = file([mod(1, { dependencies: [G(2)] }), mod(2, { isSelected: false })]);
    const sel = computeSelection(f, pc);
    const issues = checkSelectionConstraints(f, sel, "Compatible");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "dependency-missing", severity: "error", modGuid: G(1) });
    expect(sel.selectedGuids.has(G(2))).toBe(false);
  });

  it("reports restrictions", () => {
    const f = file([mod(1, { restrictions: [G(2)] }), mod(2)]);
    const issues = checkSelectionConstraints(f, computeSelection(f, pc), "Compatible");
    expect(issues.map((i) => i.code)).toEqual(["restriction-selected"]);
  });

  it("reports untested pairs as errors at Compatible and warnings at Untested", () => {
    const f = file([mod(1, { untestedWith: [G(2)] }), mod(2)]);
    const sel = computeSelection(f, pc);
    expect(checkSelectionConstraints(f, sel, "Compatible")[0]).toMatchObject({ code: "untested-pair", severity: "error" });
    expect(checkSelectionConstraints(f, sel, "Untested")[0]).toMatchObject({ code: "untested-pair", severity: "warning" });
  });

  it("reports two selected options of one exclusive group and option dependencies", () => {
    const f = file([
      mod(1, {
        options: [option(11, { exclusiveGroup: "hk" }), option(12, { exclusiveGroup: "HK" }), option(13, { dependencies: [G(2)] })],
      }),
      mod(2, { isSelected: false }),
    ]);
    const issues = checkSelectionConstraints(f, computeSelection(f, pc), "Compatible");
    expect(issues.map((i) => i.code).sort()).toEqual(["dependency-missing", "exclusive-group"]);
  });

  it("ignores references to GUIDs that are not in the file", () => {
    const f = file([mod(1, { dependencies: [G(99)] })]);
    expect(checkSelectionConstraints(f, computeSelection(f, pc), "Compatible")).toEqual([]);
  });
});

describe("applySelection / selectByTier / resolveDependencyClosure", () => {
  it("selects an option's parent and enforces exclusive groups", () => {
    const f = file([mod(1, { isSelected: false, options: [option(11, { exclusiveGroup: "g" }), option(12, { isSelected: false, exclusiveGroup: "g" })] })]);
    const changed = applySelection(f, G(12), true);
    expect(changed.sort()).toEqual([G(1), G(11), G(12)].sort());
    expect(f.mods[0].isSelected).toBe(true);
    expect(f.mods[0].options[0].isSelected).toBe(false);
    expect(f.mods[0].options[1].isSelected).toBe(true);
  });

  it("applies option flags with a mod selection", () => {
    const f = file([mod(1, { isSelected: false, options: [option(11, { isSelected: false }), option(12)] })]);
    applySelection(f, G(1), true, { [G(11)]: true, [G(12)]: false });
    expect(f.mods[0].options.map((o) => o.isSelected)).toEqual([true, false]);
    expect(() => applySelection(f, G(99), true)).toThrow();
  });

  it("selects exactly the given tiers", () => {
    const f = file([mod(1, { tier: "Essential", isSelected: false }), mod(2, { tier: "Optional" }), mod(3, { tier: "Recommended", isSelected: false })]);
    const changed = selectByTier(f, ["Essential", "Recommended"]);
    expect(changed.sort()).toEqual([G(1), G(2), G(3)].sort());
    expect(f.mods.map((m) => m.isSelected)).toEqual([true, false, true]);
  });

  it("returns the transitive set of GUIDs that would need selecting", () => {
    const f = file([
      mod(1, { isSelected: false, dependencies: [G(2), G(31)] }),
      mod(2, { isSelected: false, dependencies: [G(4)] }),
      mod(3, { isSelected: false, options: [option(31, { isSelected: false })] }),
      mod(4),
    ]);
    expect(resolveDependencyClosure(f, [G(1)])).toEqual([G(1), G(2), G(3), G(31)]);
    expect(resolveDependencyClosure(f, [G(4)])).toEqual([]);
  });
});
