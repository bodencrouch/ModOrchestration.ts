import { describe, expect, it } from "vitest";
import { isGuid } from "../../model/guid.js";
import { normalizeNameForGuid, stableChildGuid, stableGuidForName, uuidV5 } from "./stableGuid.js";

describe("uuidV5", () => {
  it("matches the RFC 4122 example (DNS namespace, python.org)", () => {
    expect(uuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "python.org")).toBe("886313e1-3b8a-5372-9b90-0c9aee199e5d");
  });
});

describe("stableGuidForName", () => {
  it("is deterministic and normalizes names", () => {
    const a = stableGuidForName("JC's Minor Fixes for K1");
    expect(isGuid(a)).toBe(true);
    expect(a).toBe(stableGuidForName("  jc's  minor fixes for k1 "));
    expect(a).toBe(stableGuidForName("[JC's Minor Fixes for K1](https://x)"));
    expect(a).not.toBe(stableGuidForName("JC's Minor Fixes for K1", "2"));
    expect(normalizeNameForGuid("**Bold** _it_")).toBe("bold it");
  });
  it("derives distinct child guids", () => {
    const p = stableGuidForName("x");
    expect(stableChildGuid(p, "instruction", 0)).not.toBe(stableChildGuid(p, "instruction", 1));
    expect(stableChildGuid(p, "instruction", 0)).not.toBe(stableChildGuid(p, "option", 0));
    expect(stableChildGuid(p, "instruction", 0)).toBe(stableChildGuid(p, "instruction", 0));
  });
});
