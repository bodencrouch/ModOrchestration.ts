import { describe, expect, it } from "vitest";
import { createInstruction, createInstructionFile, createMod, createOption } from "../model/defaults.js";
import { parseInstructionFile, parseInstructionFileDetailed, serializeInstructionFile } from "./toml.js";

const MODERN = String.raw`
[Config]
TargetGame = "KOTOR1"
Name = "KOTOR 1 Full Build"
BeforeModListContent = "Read me first."

[[thisMod]]
Guid = "{6A58FE3D-DA55-4075-9C45-05E4C2E9C3FB}"
Name = "Ultimate Dantooine"
Description = "High res Dantooine."
Author = "ShiningRedHD"
Tier = "2 - Recommended"
Category = ["Graphics Improvement"]
Language = "YES"
InstallationMethod = "Loose-File"
ModLink = ["https://www.nexusmods.com/kotor/mods/1103"]
Dependencies = ["{C5418549-6B7E-4A8C-8B8E-4AA1BC63C732}"]
Restrictions = []
InstallAfter = []
InstallBefore = []
IsSelected = true
ExpectedFiles = ["Ultimate Dantooine High Resolution - TPC Version 1.0.rar"]
UntestedWith = ["{11111111-2222-3333-4444-555555555555}"]
FullBuildOnly = true
IsWidescreen = false
AspyrOnly = false
IsPatch = false
Images = ["https://example.com/a.png"]
MysteryKey = "dropped"

[thisMod.ExpectedHashes]
"Ultimate Dantooine High Resolution - TPC Version 1.0.rar" = "DA39A3EE5E6B4B0D3255BFEF95601890AFD80709"

[[thisMod.Instructions]]
Guid = "{0B1E5C2A-8F3D-4E6B-9A7C-1D2E3F4A5B6C}"
Action = "Extract"
Overwrite = true
Source = ["<<modDirectory>>\\Ultimate Dantooine High Resolution - TPC Version*.rar"]

[[thisMod.Instructions]]
Action = "Delete"
Source = "<<modDirectory>>\\Ultimate Dantooine High Resolution - TPC Version*\\DAN_wall03.tpc"

[[thisMod.Instructions]]
Action = "Move"
Overwrite = true
Source = ["<<modDirectory>>\\Ultimate Dantooine High Resolution - TPC Version*\\*"]
Destination = "<<kotorDirectory>>\\Override"
Platform = "Mobile"

[[thisMod.Options]]
Guid = "{7A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D}"
Name = "HK-47 only"
Description = "Only HK."
Restrictions = ["{8A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D}"]
IsSelected = true
ExclusiveGroup = "hk"

[[thisMod.Options.Instructions]]
Action = "Move"
Source = ["<<modDirectory>>\\VisuallyRepairHK47*\\HK-47 only\\*"]
Destination = "<<kotorDirectory>>\\Override"

[[thisMod]]
Guid = "{C5418549-6B7E-4A8C-8B8E-4AA1BC63C732}"
Name = "KOTOR 1 Community Patch"
Authors = ["A Future Pilot", "et al"]
Tier = "1 - Essential"
Category = "Bugfix & Immersion"
InstallationMethod = "TSLPatcher"
`;

const LEGACY = String.raw`
[config]
targetGame = "kotor 2"

[[modList]]
guid = "6A58FE3D-DA55-4075-9C45-05E4C2E9C3FB"
name = "Second In File"
author = "Kexikus, JC and ndix UR"
tier = "Essential"
category = "Bugfix & Immersion"
dependencies = "{C5418549-6B7E-4A8C-8B8E-4AA1BC63C732}"
restricted = ["not-a-guid"]
installOrder = 2
patch = true
[[modList.instructions]]
type = "extract"
paths = "<<modDirectory>>\\old*.zip"
[[modList.instructions]]
type = "move"
paths = ["<<modDirectory>>\\old*\\*"]
destination = "<<kotorDirectory>>\\Override"
overwrite = false

[[modList]]
name = "First In File"
tier = "4 - Option"
installOrder = 1
`;

describe("parseInstructionFile (modern)", () => {
  const { file, warnings } = parseInstructionFileDetailed(MODERN);
  const [dan, k1cp] = file.mods;

  it("reads config", () => {
    expect(file.config.targetGame).toBe("KOTOR1");
    expect(file.config.name).toBe("KOTOR 1 Full Build");
    expect(file.config.beforeModListContent).toBe("Read me first.");
  });

  it("reads mods with normalized GUIDs, tiers and categories", () => {
    expect(file.mods).toHaveLength(2);
    expect(dan.guid).toBe("6a58fe3d-da55-4075-9c45-05e4c2e9c3fb");
    expect(dan.name).toBe("Ultimate Dantooine");
    expect(dan.authors).toEqual(["ShiningRedHD"]);
    expect(dan.tier).toBe("Recommended");
    expect(dan.category).toEqual(["Graphics Improvement"]);
    expect(dan.language).toBe("YES");
    expect(dan.installationMethod).toBe("Loose-File");
    expect(dan.modLink).toEqual(["https://www.nexusmods.com/kotor/mods/1103"]);
    expect(dan.dependencies).toEqual(["c5418549-6b7e-4a8c-8b8e-4aa1bc63c732"]);
    expect(dan.isSelected).toBe(true);
    expect(dan.expectedFiles).toEqual(["Ultimate Dantooine High Resolution - TPC Version 1.0.rar"]);
    expect(dan.expectedHashes).toEqual({ "Ultimate Dantooine High Resolution - TPC Version 1.0.rar": "da39a3ee5e6b4b0d3255bfef95601890afd80709" });
    expect(dan.untestedWith).toEqual(["11111111-2222-3333-4444-555555555555"]);
    expect(dan.fullBuildOnly).toBe(true);
    expect(dan.images).toEqual(["https://example.com/a.png"]);
    expect(k1cp.authors).toEqual(["A Future Pilot", "et al"]);
    expect(k1cp.tier).toBe("Essential");
    expect(k1cp.category).toEqual(["Bugfix", "Immersion"]);
    expect(k1cp.installationMethod).toBe("TSLPatcher");
  });

  it("reads instructions, string sources, platform and generates missing GUIDs", () => {
    expect(dan.instructions.map((i) => i.action)).toEqual(["Extract", "Delete", "Move"]);
    expect(dan.instructions[0].guid).toBe("0b1e5c2a-8f3d-4e6b-9a7c-1d2e3f4a5b6c");
    expect(dan.instructions[1].source).toEqual(["<<modDirectory>>\\Ultimate Dantooine High Resolution - TPC Version*\\DAN_wall03.tpc"]);
    expect(dan.instructions[1].guid).toMatch(/^[0-9a-f-]{36}$/);
    expect(dan.instructions[1].guid).not.toBe(dan.instructions[2].guid);
    expect(dan.instructions[2].destination).toBe("<<kotorDirectory>>\\Override");
    expect(dan.instructions[2].platform).toBe("Mobile");
    expect(dan.instructions[2].overwrite).toBe(true);
  });

  it("reads options", () => {
    expect(dan.options).toHaveLength(1);
    const opt = dan.options[0];
    expect(opt.guid).toBe("7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d");
    expect(opt.name).toBe("HK-47 only");
    expect(opt.restrictions).toEqual(["8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"]);
    expect(opt.isSelected).toBe(true);
    expect(opt.exclusiveGroup).toBe("hk");
    expect(opt.instructions).toHaveLength(1);
    expect(opt.instructions[0].action).toBe("Move");
  });

  it("collects warnings for unknown keys and generated GUIDs", () => {
    expect(warnings.some((w) => w.includes('unknown key "MysteryKey"'))).toBe(true);
    expect(warnings.some((w) => w.includes("had no Guid"))).toBe(true);
  });

  it("parseInstructionFile returns the same file (modulo generated instruction GUIDs)", () => {
    const strip = (f: typeof file): unknown =>
      JSON.parse(JSON.stringify(f, (key, value: unknown) => (key === "guid" && typeof value === "string" && !MODERN.toUpperCase().includes(value.toUpperCase()) ? "<generated>" : value)));
    expect(strip(parseInstructionFile(MODERN))).toEqual(strip(file));
  });
});

describe("parseInstructionFile (legacy dialect)", () => {
  const { file, warnings } = parseInstructionFileDetailed(LEGACY);

  it("accepts modList, lowercase keys, type/paths, restricted, patch, installOrder", () => {
    expect(file.config.targetGame).toBe("KOTOR2");
    expect(file.mods.map((m) => m.name)).toEqual(["First In File", "Second In File"]);
    const mod = file.mods[1];
    expect(mod.guid).toBe("6a58fe3d-da55-4075-9c45-05e4c2e9c3fb");
    expect(mod.authors).toEqual(["Kexikus", "JC", "ndix UR"]);
    expect(mod.tier).toBe("Essential");
    expect(mod.category).toEqual(["Bugfix", "Immersion"]);
    expect(mod.dependencies).toEqual(["c5418549-6b7e-4a8c-8b8e-4aa1bc63c732"]);
    expect(mod.restrictions).toEqual(["not-a-guid"]);
    expect(mod.isPatch).toBe(true);
    expect(mod.instructions.map((i) => i.action)).toEqual(["Extract", "Move"]);
    expect(mod.instructions[0].source).toEqual(["<<modDirectory>>\\old*.zip"]);
    expect(mod.instructions[1].overwrite).toBe(false);
    expect(file.mods[0].tier).toBe("Optional");
    expect(file.mods[0].guid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("warns about legacy usage", () => {
    expect(warnings.some((w) => w.includes("installOrder"))).toBe(true);
    expect(warnings.some((w) => w.includes("not a GUID"))).toBe(true);
    expect(warnings.some((w) => w.includes("missing Guid"))).toBe(true);
  });
});

describe("hard errors", () => {
  it("throws on invalid TOML", () => {
    expect(() => parseInstructionFile("[[thisMod]\nName = ")).toThrow(/Invalid instruction file/);
  });
  it("throws on unknown actions", () => {
    expect(() => parseInstructionFile('[[thisMod]]\nName = "x"\n[[thisMod.Instructions]]\nAction = "Teleport"\n')).toThrow(/unknown instruction action/);
  });
  it("tolerates a file with only config", () => {
    const r = parseInstructionFileDetailed('[Config]\nTargetGame = "KOTOR1"\n');
    expect(r.file.mods).toEqual([]);
    expect(r.warnings.some((w) => w.includes("no [[thisMod]]"))).toBe(true);
  });
});

describe("serializeInstructionFile", () => {
  const file = createInstructionFile({
    config: { targetGame: "KOTOR1", name: "Test Build", compatibilityLevel: "Compatible", patcherEngine: "Native", spoilerFree: false, platform: "PC", beforeModListContent: "Hello\nworld" },
    mods: [
      createMod({
        guid: "6a58fe3d-da55-4075-9c45-05e4c2e9c3fb",
        name: "Ultimate Dantooine",
        description: "High res",
        authors: ["ShiningRedHD"],
        modLink: ["https://example.com"],
        category: ["Graphics Improvement"],
        tier: "Recommended",
        language: "YES",
        installationMethod: "Loose-File",
        dependencies: ["c5418549-6b7e-4a8c-8b8e-4aa1bc63c732"],
        expectedHashes: { "a.rar": "abc" },
        isSelected: true,
        fullBuildOnly: true,
        instructions: [
          createInstruction("Extract", { guid: "0b1e5c2a-8f3d-4e6b-9a7c-1d2e3f4a5b6c", source: ["<<modDirectory>>\\UD*.rar"] }),
          createInstruction("Move", { guid: "1b1e5c2a-8f3d-4e6b-9a7c-1d2e3f4a5b6c", source: ["<<modDirectory>>\\UD*\\*"], destination: "<<kotorDirectory>>\\Override", overwrite: false, platform: "Mobile", arguments: "x" }),
        ],
        options: [
          createOption({
            guid: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
            name: "HK-47 only",
            isSelected: true,
            exclusiveGroup: "hk",
            instructions: [createInstruction("Move", { guid: "2b1e5c2a-8f3d-4e6b-9a7c-1d2e3f4a5b6c", source: ["a"], destination: "b" })],
          }),
        ],
      }),
      createMod({ guid: "c5418549-6b7e-4a8c-8b8e-4aa1bc63c732", name: "K1CP", authors: ["A", "B"], tier: "Essential" }),
    ],
  });
  const text = serializeInstructionFile(file);

  it("emits the C# style", () => {
    expect(text).toContain("[Config]");
    expect(text).toContain('TargetGame = "KOTOR1"');
    expect(text).toContain("[[thisMod]]");
    expect(text).toContain('Guid = "{6A58FE3D-DA55-4075-9C45-05E4C2E9C3FB}"');
    expect(text).toContain('Tier = "2 - Recommended"');
    expect(text).toContain('Author = "ShiningRedHD"');
    expect(text).toContain('Authors = [ "A", "B" ]');
    expect(text).toContain("[[thisMod.Instructions]]");
    expect(text).toContain("[[thisMod.Options]]");
    expect(text).toContain("[[thisMod.Options.Instructions]]");
    expect(text).toContain('Dependencies = [ "{C5418549-6B7E-4A8C-8B8E-4AA1BC63C732}" ]');
    expect(text).toContain("FullBuildOnly = true");
    expect(text).toContain('ExclusiveGroup = "hk"');
  });

  it("round-trips exactly", () => {
    const { file: back, warnings } = parseInstructionFileDetailed(text);
    expect(warnings).toEqual([]);
    expect(back).toEqual(file);
  });
});
