import { describe, expect, it } from "vitest";
import { matchCleanListEntry, parseCleanList, parseCsv } from "./cleanlist.js";

describe("parseCsv", () => {
  it("handles quotes, embedded commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"c, d","e ""q"" f"\n')).toEqual([
      ["a", "b"],
      ["c, d", 'e "q" f'],
    ]);
  });
  it("handles a final row without newline", () => {
    expect(parseCsv("x,y")).toEqual([["x", "y"]]);
  });
});

describe("parseCleanList", () => {
  const csv = [
    "# files to remove when both mods are selected",
    "ModName,File",
    "",
    "KOTOR 1 Community Patch,Override/foo.tga,Override/bar.tga",
    '"Ultimate Dantooine",Override/DAN_wall03.tpc',
    "KOTOR 1 Community Patch,Override/baz.tga",
    "   ",
  ].join("\r\n");

  it("skips comments, header and blank lines, merges duplicate mod names", () => {
    expect(parseCleanList(csv)).toEqual([
      { modName: "KOTOR 1 Community Patch", files: ["Override/foo.tga", "Override/bar.tga", "Override/baz.tga"] },
      { modName: "Ultimate Dantooine", files: ["Override/DAN_wall03.tpc"] },
    ]);
  });
});

describe("matchCleanListEntry", () => {
  const entry = { modName: "Ultimate Dantooine", files: [] };
  it("matches exact (case-insensitive) and partial containment either way", () => {
    expect(matchCleanListEntry(entry, ["ultimate dantooine"])).toBe(true);
    expect(matchCleanListEntry(entry, ["Ultimate Dantooine High Resolution"])).toBe(true);
    expect(matchCleanListEntry(entry, ["Dantooine"])).toBe(true);
    expect(matchCleanListEntry(entry, ["Korriban"])).toBe(false);
    expect(matchCleanListEntry(entry, [])).toBe(false);
  });
});
