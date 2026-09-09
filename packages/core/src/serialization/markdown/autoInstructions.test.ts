import { describe, expect, it } from "vitest";
import { createMod } from "../../model/defaults.js";
import { generateInstructionsFromDescription, guessArchive } from "./autoInstructions.js";

const GUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("generateInstructionsFromDescription", () => {
  it("TSLPatcher: extract then patcher", () => {
    const mod = createMod({ guid: GUID, name: "NPC Alignment Fix", installationMethod: "TSLPatcher", modLink: ["https://deadlystream.com/files/file/1/"] });
    const instrs = generateInstructionsFromDescription(mod);
    expect(instrs.map((i) => i.action)).toEqual(["Extract", "Patcher"]);
    expect(instrs[0].source).toEqual(["<<modDirectory>>\\NPC Alignment Fix*.{zip,rar,7z}"]);
    expect(instrs[1].source).toEqual(["<<modDirectory>>\\NPC Alignment Fix*"]);
    expect(instrs[1].destination).toBe("<<kotorDirectory>>");
    expect(instrs.every((i) => i.description === "auto-generated")).toBe(true);
    expect(instrs[0].guid).not.toBe(instrs[1].guid);
    expect(generateInstructionsFromDescription(mod)).toEqual(instrs);
  });
  it("Loose-File: extract then move * to Override, using expected files when present", () => {
    const mod = createMod({ guid: GUID, name: "X: Y?", installationMethod: "Loose-File", expectedFiles: ["Ultimate Dantooine 1.0.rar"] });
    const instrs = generateInstructionsFromDescription(mod);
    expect(instrs.map((i) => i.action)).toEqual(["Extract", "Move"]);
    expect(instrs[0].source).toEqual(["<<modDirectory>>\\Ultimate Dantooine 1.0.rar"]);
    expect(instrs[1].source).toEqual(["<<modDirectory>>\\Ultimate Dantooine 1.0\\*"]);
    expect(instrs[1].destination).toBe("<<kotorDirectory>>\\Override");
  });
  it("executable links run directly", () => {
    const mod = createMod({ guid: GUID, name: "TSLRCM", installationMethod: "Executable", modLink: ["https://example.com/dl/tslrcm2022.exe"] });
    const instrs = generateInstructionsFromDescription(mod);
    expect(instrs.map((i) => i.action)).toEqual(["Execute"]);
    expect(instrs[0].source).toEqual(["<<modDirectory>>\\tslrcm2022.exe"]);
  });
  it("archive links use the file name; unknown methods guess from text", () => {
    expect(guessArchive(createMod({ name: "n", modLink: ["https://example.com/a/b/mod%20v2.7z"] }))).toEqual({
      pattern: "<<modDirectory>>\\mod v2.7z",
      folder: "<<modDirectory>>\\mod v2",
      isExecutable: false,
    });
    const unknown = generateInstructionsFromDescription(createMod({ guid: GUID, name: "U", description: "Drop into Override." }));
    expect(unknown.map((i) => i.action)).toEqual(["Extract", "Move"]);
    expect(generateInstructionsFromDescription(createMod({ guid: GUID, name: "V" })).map((i) => i.action)).toEqual(["Extract"]);
  });
});
