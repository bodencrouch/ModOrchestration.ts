import { describe, expect, it } from "vitest";

import {
  MissingPlaceholderError,
  PathEscapeError,
  PathResolver,
  baseName,
  containsPlaceholder,
  hasWildcard,
  isInsideRoot,
  joinPath,
  normalizePath,
  parentPath,
  relativeToRoot,
  rootOf,
  splitPath,
  toNative,
  toPosix,
  unresolve,
} from "./paths.js";

const dirs = { modDirectory: "/home/u/mods", kotorDirectory: "/games/kotor" };
const winDirs = { modDirectory: "C:\\Users\\u\\Mods", kotorDirectory: "D:\\Games\\KOTOR" };

describe("path helpers", () => {
  it("toPosix converts backslashes, including UNC", () => {
    expect(toPosix("C:\\a\\b")).toBe("C:/a/b");
    expect(toPosix("\\\\server\\share\\x")).toBe("//server/share/x");
  });

  it("toNative is identity outside Windows", () => {
    if (process.platform !== "win32") expect(toNative("/a/b")).toBe("/a/b");
  });

  it("rootOf handles posix, drive letters and UNC", () => {
    expect(rootOf("/a/b")).toBe("/");
    expect(rootOf("c:\\a")).toBe("C:/");
    expect(rootOf("//server/share/a")).toBe("//server/share/");
    expect(rootOf("\\\\server\\share")).toBe("//server/share/");
    expect(rootOf("relative/x")).toBe("");
  });

  it("normalizePath collapses . and .., strips trailing slash, keeps roots", () => {
    expect(normalizePath("/a/./b/../c/")).toBe("/a/c");
    expect(normalizePath("C:\\a\\..\\b\\")).toBe("C:/b");
    expect(normalizePath("C:/")).toBe("C:/");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/a//b")).toBe("/a/b");
    expect(normalizePath("/../..")).toBe("/");
    expect(normalizePath("a/../../b")).toBe("../b");
    expect(normalizePath("")).toBe(".");
  });

  it("splitPath / parentPath / baseName / joinPath", () => {
    expect(splitPath("C:/a/b")).toEqual({ root: "C:/", segments: ["a", "b"] });
    expect(parentPath("C:/a")).toBe("C:/");
    expect(parentPath("C:/")).toBe("C:/");
    expect(parentPath("/a/b")).toBe("/a");
    expect(baseName("/a/b.txt")).toBe("b.txt");
    expect(baseName("/")).toBe("");
    expect(joinPath("/a", "b", "../c")).toBe("/a/c");
    expect(joinPath("C:/", "x")).toBe("C:/x");
  });

  it("hasWildcard only honours * and ?", () => {
    expect(hasWildcard("/a/*.zip")).toBe(true);
    expect(hasWildcard("/a/b?.zip")).toBe(true);
    expect(hasWildcard("/a/[K1] mod (v2)/{x}")).toBe(false);
  });

  it("containsPlaceholder is case-insensitive", () => {
    expect(containsPlaceholder("<<MODDIRECTORY>>/x")).toBe(true);
    expect(containsPlaceholder("<<kotorDirectory>>")).toBe(true);
    expect(containsPlaceholder("/x")).toBe(false);
  });
});

describe("isInsideRoot", () => {
  it("accepts the root itself and descendants", () => {
    expect(isInsideRoot("/a/b", "/a/b")).toBe(true);
    expect(isInsideRoot("/a/b/", "/a/b/c")).toBe(true);
    expect(isInsideRoot("/a/b", "/a/bc")).toBe(false);
    expect(isInsideRoot("/a/b", "/a")).toBe(false);
  });

  it("is case-insensitive for Windows-style paths only", () => {
    expect(isInsideRoot("C:/Mods", "c:/mods/x")).toBe(true);
    expect(isInsideRoot("//srv/share/mods", "//SRV/Share/Mods/x")).toBe(true);
    if (process.platform !== "win32") expect(isInsideRoot("/Mods", "/mods/x")).toBe(false);
  });

  it("rejects relative paths", () => {
    expect(isInsideRoot("/a", "a/b")).toBe(false);
  });
});

describe("PathResolver", () => {
  const resolver = new PathResolver(dirs);

  it("replaces placeholders case-insensitively and normalizes separators", () => {
    expect(resolver.resolve("<<modDirectory>>\\Foo\\bar.zip")).toBe("/home/u/mods/Foo/bar.zip");
    expect(resolver.resolve("<<KOTORDIRECTORY>>/Override")).toBe("/games/kotor/Override");
    expect(resolver.resolve("<<ModDirectory>>/a/./b/../c")).toBe("/home/u/mods/a/c");
  });

  it("resolves a bare placeholder to the root", () => {
    expect(resolver.resolve("<<kotorDirectory>>")).toBe("/games/kotor");
    expect(resolver.resolve("<<modDirectory>>/")).toBe("/home/u/mods");
  });

  it("keeps wildcards", () => {
    expect(resolver.resolve("<<modDirectory>>/*.zip")).toBe("/home/u/mods/*.zip");
  });

  it("throws PathEscapeError on ..", () => {
    expect(() => resolver.resolve("<<modDirectory>>/../etc/passwd")).toThrow(PathEscapeError);
    expect(() => resolver.resolve("<<kotorDirectory>>/Override/../../x")).toThrow(PathEscapeError);
    try {
      resolver.resolve("<<modDirectory>>/../../x");
    } catch (err) {
      expect(err).toBeInstanceOf(PathEscapeError);
      expect((err as PathEscapeError).path).toBe("/home/x");
      expect((err as PathEscapeError).root).toBe("/home/u/mods");
      expect((err as PathEscapeError).raw).toBe("<<modDirectory>>/../../x");
    }
  });

  it("does not let a sibling with a shared prefix pass", () => {
    expect(() => resolver.resolve("<<modDirectory>>/../mods2/x")).toThrow(PathEscapeError);
  });

  it("allows absolute paths inside a root and rejects those outside", () => {
    expect(resolver.resolve("/games/kotor/Override/x.tpc")).toBe("/games/kotor/Override/x.tpc");
    expect(() => resolver.resolve("/etc/passwd")).toThrow(PathEscapeError);
  });

  it("rejects relative paths without placeholder", () => {
    expect(() => resolver.resolve("Override/x.tpc")).toThrow(MissingPlaceholderError);
    expect(() => resolver.resolve("")).toThrow(MissingPlaceholderError);
  });

  it("resolveMany maps in order", () => {
    expect(resolver.resolveMany(["<<modDirectory>>/a", "<<kotorDirectory>>/b"])).toEqual(["/home/u/mods/a", "/games/kotor/b"]);
  });

  it("handles Windows drive letters and UNC roots on any host", () => {
    const win = new PathResolver(winDirs);
    expect(win.resolve("<<modDirectory>>\\Foo\\bar.zip")).toBe("C:/Users/u/Mods/Foo/bar.zip");
    expect(win.resolve("<<kotorDirectory>>/override")).toBe("D:/Games/KOTOR/override");
    expect(win.resolve("c:\\users\\U\\mods\\x")).toBe("C:/users/U/mods/x");
    expect(() => win.resolve("<<modDirectory>>\\..\\..\\..\\Windows")).toThrow(PathEscapeError);
    expect(() => win.resolve("E:\\Other")).toThrow(PathEscapeError);
    expect(() => win.resolve("C:\\Users\\u\\Mods2\\x")).toThrow(PathEscapeError);

    const unc = new PathResolver({ modDirectory: "\\\\nas\\share\\mods", kotorDirectory: "\\\\nas\\share\\games\\kotor" });
    expect(unc.resolve("<<modDirectory>>\\x.zip")).toBe("//nas/share/mods/x.zip");
    expect(unc.resolve("\\\\NAS\\share\\games\\kotor\\Override")).toBe("//NAS/share/games/kotor/Override");
    expect(() => unc.resolve("<<modDirectory>>\\..\\other\\x")).toThrow(PathEscapeError);
    expect(() => unc.resolve("\\\\other\\share\\x")).toThrow(PathEscapeError);
    // The share is the UNC root: ".." cannot climb above it, so a share-level mod dir cannot be escaped.
    const shareRoot = new PathResolver({ modDirectory: "\\\\nas\\mods", kotorDirectory: "\\\\nas\\kotor" });
    expect(shareRoot.resolve("<<modDirectory>>\\..\\..\\x")).toBe("//nas/mods/x");
  });

  it("drive-letter path cannot escape via ..-to-root", () => {
    const win = new PathResolver(winDirs);
    expect(() => win.resolve("<<modDirectory>>/../../../../..")).toThrow(PathEscapeError);
  });
});

describe("relativeToRoot / unresolve", () => {
  it("classifies paths under either root", () => {
    expect(relativeToRoot(dirs, "/home/u/mods/a/b.zip")).toEqual({ root: "mod", rel: "a/b.zip" });
    expect(relativeToRoot(dirs, "/games/kotor")).toEqual({ root: "kotor", rel: "" });
    expect(() => relativeToRoot(dirs, "/tmp/x")).toThrow(PathEscapeError);
  });

  it("prefers the deeper root when nested", () => {
    const nested = { modDirectory: "/games", kotorDirectory: "/games/kotor" };
    expect(relativeToRoot(nested, "/games/kotor/Override")).toEqual({ root: "kotor", rel: "Override" });
    expect(relativeToRoot(nested, "/games/mods/x")).toEqual({ root: "mod", rel: "mods/x" });
  });

  it("unresolve produces placeholder form and round-trips", () => {
    const resolver = new PathResolver(dirs);
    expect(unresolve(dirs, "/home/u/mods/Foo/bar.zip")).toBe("<<modDirectory>>/Foo/bar.zip");
    expect(unresolve(dirs, "/games/kotor")).toBe("<<kotorDirectory>>");
    expect(unresolve(dirs, "/games/kotor/Override/")).toBe("<<kotorDirectory>>/Override");
    expect(resolver.unresolve(resolver.resolve("<<modDirectory>>/x/*.tpc"))).toBe("<<modDirectory>>/x/*.tpc");
    expect(unresolve(winDirs, "c:\\users\\u\\mods\\A\\b.7z")).toBe("<<modDirectory>>/A/b.7z");
  });

  it("unresolve leaves outside paths normalized but unchanged", () => {
    expect(unresolve(dirs, "/tmp\\x")).toBe("/tmp/x");
  });
});
