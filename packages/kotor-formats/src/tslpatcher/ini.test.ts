import { describe, expect, it } from "vitest";
import { numericSuffix, orderByNumericSuffix, parseIni } from "./ini.js";

describe("ini", () => {
  it("parses sections, keys, comments, BOM and CRLF", () => {
    const text = "﻿; leading comment\r\n[Settings]\r\nWindowCaption=Hello = World\r\n# hash comment\r\nLogLevel = 3\r\n\r\n[TLKList]\r\nStrRef0=5\r\nStrRef0=6\r\nNoValue\r\n";
    const doc = parseIni(text);
    expect(doc.sectionNames).toEqual(["Settings", "TLKList"]);
    const s = doc.getSection("settings")!;
    expect(s.get("windowcaption")).toBe("Hello = World");
    expect(s.get("LogLevel")).toBe("3");
    expect(s.line).toBe(2);
    const t = doc.getSection("TLKList")!;
    expect(t.get("strref0")).toBe("6");
    expect(t.getAll("StrRef0")).toEqual(["5", "6"]);
    expect(t.entries.map((e) => e.key)).toEqual(["StrRef0", "StrRef0", "NoValue"]);
    expect(t.get("NoValue")).toBe("");
    expect(t.has("nope")).toBe(false);
  });

  it("merges repeated sections and keeps entry order", () => {
    const doc = parseIni("[A]\nx=1\n[B]\ny=2\n[a]\nz=3\n");
    expect(doc.sections).toHaveLength(2);
    expect(doc.getSection("A")!.entries.map((e) => e.key)).toEqual(["x", "z"]);
  });

  it("orders numbered keys by suffix", () => {
    expect(numericSuffix("AddRow12", "addrow")).toBe(12);
    expect(numericSuffix("AddRowX", "AddRow")).toBeUndefined();
    expect(numericSuffix("AddRow", "AddRow")).toBeUndefined();
    const doc = parseIni("[t]\nAddRow2=c\n!Dest=x\nChangeRow0=a\nAddRow10=e\nAddRow1=b\n");
    const ordered = orderByNumericSuffix(doc.getSection("t")!.entries, ["AddRow", "ChangeRow"]);
    expect(ordered.map((e) => e.key)).toEqual(["ChangeRow0", "!Dest", "AddRow1", "AddRow2", "AddRow10"]);
    expect(doc.getSection("t")!.numbered("AddRow").map((e) => e.index)).toEqual([1, 2, 10]);
  });
});
