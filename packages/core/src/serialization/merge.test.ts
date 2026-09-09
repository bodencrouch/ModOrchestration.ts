import { describe, expect, it } from "vitest";
import { createInstruction, createInstructionFile, createMod, createOption } from "../model/defaults.js";
import { mergeInstructionFiles } from "./merge.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NEW_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describe("mergeInstructionFiles", () => {
  const existing = createInstructionFile({
    config: { targetGame: "KOTOR1", name: "old", compatibilityLevel: "Compatible", patcherEngine: "Native", spoilerFree: false, platform: "PC" },
    mods: [
      createMod({ guid: A, name: "Alpha Mod", description: "old desc", instructions: [createInstruction("Extract", { source: ["a.zip"] })], isSelected: true }),
      createMod({ guid: B, name: "Beta", instructions: [], dependencies: [A] }),
      createMod({ guid: C, name: "Gone", instructions: [createInstruction("Extract", { source: ["c.zip"] })] }),
    ],
  });
  const incoming = createInstructionFile({
    config: { targetGame: "KOTOR1", name: "new", compatibilityLevel: "Compatible", patcherEngine: "Native", spoilerFree: false, platform: "PC", beforeModListContent: "intro" },
    mods: [
      // Same name, different guid: matched by name, incoming guid remapped.
      createMod({ guid: NEW_A, name: "alpha mod", description: "new desc", tier: "Essential", instructions: [createInstruction("Move", { source: ["x"] })] }),
      // Matched by guid; existing has no instructions so incoming's win.
      createMod({ guid: B, name: "Beta", instructions: [createInstruction("Extract", { source: ["b.zip"] })], dependencies: [NEW_A] }),
      createMod({ guid: D, name: "Delta", dependencies: [NEW_A], options: [createOption({ name: "o", dependencies: [NEW_A] })] }),
    ],
  });
  const result = mergeInstructionFiles(existing, incoming);

  it("matches by guid then by name and reports changes", () => {
    expect(result.added).toEqual([D]);
    expect(result.updated).toEqual([A, B]);
    expect(result.removed).toEqual([C]);
    expect(result.file.mods.map((m) => m.guid)).toEqual([A, B, D]);
  });

  it("keeps existing instructions and records the conflict", () => {
    const alpha = result.file.mods[0];
    expect(alpha.description).toBe("new desc");
    expect(alpha.tier).toBe("Essential");
    expect(alpha.isSelected).toBe(true);
    expect(alpha.instructions[0].action).toBe("Extract");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ guid: A, field: "instructions" });
  });

  it("uses incoming instructions when existing has none", () => {
    expect(result.file.mods[1].instructions[0].source).toEqual(["b.zip"]);
  });

  it("remaps incoming guids to existing ones everywhere", () => {
    expect(result.file.mods[1].dependencies).toEqual([A]);
    expect(result.file.mods[2].dependencies).toEqual([A]);
    expect(result.file.mods[2].options[0].dependencies).toEqual([A]);
  });

  it("merges config doc fields", () => {
    expect(result.file.config.name).toBe("new");
    expect(result.file.config.beforeModListContent).toBe("intro");
  });

  it("is a no-op when merging a file with itself", () => {
    const r = mergeInstructionFiles(existing, existing);
    expect(r.added).toEqual([]);
    expect(r.updated).toEqual([]);
    expect(r.removed).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(r.file.mods).toEqual(existing.mods);
  });
});
