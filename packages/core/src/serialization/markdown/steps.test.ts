import { describe, expect, it } from "vitest";
import { createInstruction } from "../../model/defaults.js";
import { formatStep, isStepLine, parseStructuredSteps } from "./steps.js";

const guidFor = (i: number): string => `${i.toString().padStart(8, "0")}-0000-4000-8000-000000000000`;

describe("parseStructuredSteps", () => {
  it("parses every keyword", () => {
    const lines = [
      "Some prose first.",
      "1. **EXTRACT** `<<modDirectory>>/A*.zip`",
      "2. **MOVE ALL** from `<<modDirectory>>/A*/` to `<<kotorDirectory>>/Override`",
      "3. **COPY SPECIFIC** from `<<modDirectory>>\\A*` to `<<kotorDirectory>>\\Override`:",
      "   - `x.tga`",
      "   - y.tga",
      "",
      "- **DELETE** `<<kotorDirectory>>/Override/a`, `<<kotorDirectory>>/Override/b`",
      "* **RENAME** `<<modDirectory>>/A*/a.mdl` to `b.mdl`",
      "5. **PATCHER** `<<modDirectory>>/A*/TSLPatcher.exe` with `1`",
      "6. **RUN** `<<modDirectory>>/setup.exe` (do not overwrite) — installer",
      "7. **SKIP** `<<modDirectory>>/A*/Bugfix/` (applied later)",
      "8. **CHOOSE** `<<modDirectory>>/A*/opt1`, `<<modDirectory>>/A*/opt2` to `<<kotorDirectory>>/Override` _(requires {AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA}; PC only)_",
      "9. **EXTRACT** <<modDirectory>>/bare.zip",
      "Trailing prose.",
    ];
    const r = parseStructuredSteps(lines, guidFor);
    expect(r.warnings).toEqual([]);
    expect(r.prose).toEqual(["Some prose first.", "7. **SKIP** `<<modDirectory>>/A*/Bugfix/` (applied later)", "Trailing prose."]);
    expect(r.instructions.map((i) => i.action)).toEqual(["Extract", "Move", "Copy", "Delete", "Rename", "Patcher", "Execute", "Choose", "Extract"]);
    const [extract, moveAll, copySpecific, del, rename, patcher, run, choose, bare] = r.instructions;
    expect(extract.guid).toBe(guidFor(0));
    expect(moveAll.source).toEqual(["<<modDirectory>>/A*/*"]);
    expect(copySpecific.source).toEqual(["<<modDirectory>>\\A*\\x.tga", "<<modDirectory>>\\A*\\y.tga"]);
    expect(copySpecific.destination).toBe("<<kotorDirectory>>\\Override");
    expect(del.source).toEqual(["<<kotorDirectory>>/Override/a", "<<kotorDirectory>>/Override/b"]);
    expect(rename.destination).toBe("b.mdl");
    expect(patcher.arguments).toBe("1");
    expect(patcher.destination).toBe("<<kotorDirectory>>");
    expect(run.overwrite).toBe(false);
    expect(run.description).toBe("installer");
    expect(choose.dependencies).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
    expect(choose.platform).toBe("PC");
    expect(bare.source).toEqual(["<<modDirectory>>/bare.zip"]);
  });

  it("warns on a step without a path", () => {
    const r = parseStructuredSteps(["1. **EXTRACT** the archive"], guidFor);
    expect(r.warnings).toHaveLength(1);
    expect(r.instructions[0].source).toEqual([]);
  });

  it("isStepLine only matches known keywords", () => {
    expect(isStepLine("1. **EXTRACT** `x`")).toBe(true);
    expect(isStepLine("**SKIP** x")).toBe(true);
    expect(isStepLine("**Name:** x")).toBe(false);
    expect(isStepLine("**Note** x")).toBe(false);
  });
});

describe("formatStep", () => {
  it("formats MOVE ALL / MOVE SPECIFIC / plain forms", () => {
    expect(formatStep(createInstruction("Move", { source: ["<<modDirectory>>/A*/*"], destination: "<<kotorDirectory>>/Override" }), 1)).toEqual([
      "1. **MOVE ALL** from `<<modDirectory>>/A*/*` to `<<kotorDirectory>>/Override`",
    ]);
    expect(formatStep(createInstruction("Move", { source: ["<<modDirectory>>/A*/x", "<<modDirectory>>/A*/y"], destination: "<<kotorDirectory>>/Override" }), 2)).toEqual([
      "2. **MOVE SPECIFIC** from `<<modDirectory>>/A*/` to `<<kotorDirectory>>/Override`:",
      "   - x",
      "   - y",
    ]);
    expect(formatStep(createInstruction("Move", { source: ["<<modDirectory>>/A*/x", "<<modDirectory>>/B*/y"], destination: "<<kotorDirectory>>/Override" }), 3)).toEqual([
      "3. **MOVE** `<<modDirectory>>/A*/x`, `<<modDirectory>>/B*/y` to `<<kotorDirectory>>/Override`",
    ]);
  });
  it("round-trips through the parser", () => {
    const instrs = [
      createInstruction("Extract", { guid: guidFor(0), source: ["<<modDirectory>>/A*.zip"] }),
      createInstruction("Move", { guid: guidFor(1), source: ["<<modDirectory>>\\A*\\x.tga", "<<modDirectory>>\\A*\\y.tga"], destination: "<<kotorDirectory>>\\Override", overwrite: false }),
      createInstruction("Patcher", { guid: guidFor(2), source: ["<<modDirectory>>/A*"], destination: "<<kotorDirectory>>", arguments: "ns", description: "pick the first option" }),
      createInstruction("Rename", { guid: guidFor(3), source: ["<<modDirectory>>/A*/a.mdl"], destination: "b.mdl", platform: "Mobile", dependencies: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] }),
    ];
    const lines = instrs.flatMap((i, idx) => formatStep(i, idx + 1));
    const back = parseStructuredSteps(lines, guidFor);
    expect(back.instructions).toEqual(instrs);
  });
});
