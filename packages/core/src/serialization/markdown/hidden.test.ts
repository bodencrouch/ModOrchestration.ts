import { describe, expect, it } from "vitest";
import { extractHtmlComments, findHiddenModRecord, parseHiddenModBlock, parseModSyncYamlBlock } from "./hidden.js";

describe("extractHtmlComments", () => {
  it("removes comments and returns their bodies", () => {
    const r = extractHtmlComments("a <!-- one -->b\n<!--\ntwo\n-->c");
    expect(r.text).toBe("a b\nc");
    expect(r.comments).toEqual([" one ", "\ntwo\n"]);
  });
});

describe("parseHiddenModBlock", () => {
  it("parses the unquoted line-based dialect with instructions and options", () => {
    const body = [
      "[HIDDEN:MOD]",
      "Guid = {6A58FE3D-DA55-4075-9C45-05E4C2E9C3FB}",
      "Dependencies = [{C5418549-6B7E-4A8C-8B8E-4AA1BC63C732}, \"{11111111-2222-3333-4444-555555555555}\"]",
      "IsPatch = true",
      "[[Instruction]]",
      "Action = Extract",
      "Overwrite = true",
      "Source = <<modDirectory>>\\NPC_Alignment_Fix*.rar",
      "[[Instruction]]",
      "Action = Patcher",
      "Destination = <<kotorDirectory>>",
      "Source = <<modDirectory>>\\NPC_Alignment_Fix*\\TSLPatcher.exe",
      "Source = <<modDirectory>>\\second",
      "[[Option]]",
      "Name = HK only",
      "[[Option.Instruction]]",
      "Action = Move",
      "Source = \"<<modDirectory>>\\\\x\\\\*\"",
      "Destination = '<<kotorDirectory>>\\Override'",
      "[ENDHIDDEN]",
    ].join("\n");
    const { record, error } = parseHiddenModBlock(body);
    expect(error).toBeUndefined();
    expect(record).toEqual({
      Guid: "{6A58FE3D-DA55-4075-9C45-05E4C2E9C3FB}",
      Dependencies: ["{C5418549-6B7E-4A8C-8B8E-4AA1BC63C732}", "{11111111-2222-3333-4444-555555555555}"],
      IsPatch: true,
      Instructions: [
        { Action: "Extract", Overwrite: true, Source: "<<modDirectory>>\\NPC_Alignment_Fix*.rar" },
        { Action: "Patcher", Destination: "<<kotorDirectory>>", Source: ["<<modDirectory>>\\NPC_Alignment_Fix*\\TSLPatcher.exe", "<<modDirectory>>\\second"] },
      ],
      Options: [{ Name: "HK only", Instructions: [{ Action: "Move", Source: "<<modDirectory>>\\x\\*", Destination: "<<kotorDirectory>>\\Override" }] }],
    });
  });
  it("returns nothing for unrelated comments and errors for garbage", () => {
    expect(parseHiddenModBlock(" just a note ")).toEqual({});
    expect(parseHiddenModBlock("[HIDDEN:MOD]\nthis is not a key value\n[ENDHIDDEN]").error).toMatch(/cannot parse/);
  });
});

describe("parseModSyncYamlBlock / findHiddenModRecord", () => {
  it("parses YAML after the marker", () => {
    const r = parseModSyncYamlBlock("<<ModSync>>\nGuid: abc\nInstructions:\n  - Action: Move\n    Source: [a, b]\n");
    expect(r.record).toEqual({ Guid: "abc", Instructions: [{ Action: "Move", Source: ["a", "b"] }] });
  });
  it("prefers whichever dialect is present", () => {
    expect(findHiddenModRecord([" note ", "[HIDDEN:MOD]\nGuid = x\n[ENDHIDDEN]"]).record).toEqual({ Guid: "x" });
    expect(findHiddenModRecord(["<<ModSync:Config>>\nTargetGame: KOTOR1", "<<ModSync>>\nGuid: y"]).record).toEqual({ Guid: "y" });
    expect(findHiddenModRecord([]).record).toBeUndefined();
  });
});
