import { describe, expect, it } from "vitest";
import { PatcherMemory, PatcherTokenError, parseToken, resolveToken, substituteTokenPlaceholders } from "./memory.js";

describe("memory", () => {
  it("parses tokens case-insensitively", () => {
    expect(parseToken("StrRef3")).toEqual({ kind: "strref", token: 3 });
    expect(parseToken("2damemory12")).toEqual({ kind: "2damemory", token: 12 });
    expect(parseToken("StrRef")).toBeUndefined();
    expect(parseToken("hello")).toBeUndefined();
  });
  it("resolves and fails closed", () => {
    const m = new PatcherMemory();
    m.setStrRef(0, 1234);
    m.set2da(5, "FeatList/2");
    expect(resolveToken("StrRef0", m)).toBe("1234");
    expect(resolveToken("2DAMEMORY5", m)).toBe("FeatList/2");
    expect(resolveToken("plain", m)).toBe("plain");
    expect(() => resolveToken("StrRef1", m)).toThrow(PatcherTokenError);
    expect(() => m.get2da(9)).toThrow(/2DAMEMORY9/);
    expect(substituteTokenPlaceholders("int x = #StrRef0#; y = #2DAMEMORY5#;", m)).toBe("int x = 1234; y = FeatList/2;");
  });
});
