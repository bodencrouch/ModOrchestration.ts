import { describe, expect, it } from "vitest";
import { ResourceTypes, extensionFromResourceType, resourceTypeFromExtension, splitResourceName } from "./restypes.js";

describe("restypes", () => {
  it("maps both ways", () => {
    expect(resourceTypeFromExtension("utc")).toBe(2027);
    expect(resourceTypeFromExtension(".2DA")).toBe(2017);
    expect(resourceTypeFromExtension("zzz")).toBeUndefined();
    expect(extensionFromResourceType(3007)).toBe("tpc");
    expect(extensionFromResourceType(ResourceTypes.mp3)).toBe("mp3");
    expect(extensionFromResourceType(12345)).toBeUndefined();
  });
  it("splits file names", () => {
    expect(splitResourceName("Override/p_bastila.UTC")).toEqual({ resref: "p_bastila", ext: "UTC", type: 2027 });
    expect(splitResourceName("noext")).toEqual({ resref: "noext", ext: "", type: undefined });
  });
});
