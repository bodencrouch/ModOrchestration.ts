import { describe, it, expect } from "vitest";
import { resizeGuiFields, classifyAnchor, type GuiRect } from "./gui.js";

const from = { w: 640, h: 480 };

const layout: GuiRect[] = [
  { path: "BG", left: 0, top: 0, width: 640, height: 480 },
  { path: "TOPLEFT", left: 10, top: 10, width: 100, height: 50 },
  { path: "RIGHT", left: 540, top: 10, width: 100, height: 50 }, // right edge at 640
  { path: "BOTTOM", left: 10, top: 430, width: 100, height: 50 }, // bottom edge at 480
  { path: "CENTER", left: 220, top: 190, width: 200, height: 100 }, // centered both ways
  { path: "FREE", left: 200, top: 100, width: 40, height: 40 },
  { path: "BOTTOMBAR", left: 0, top: 440, width: 640, height: 40 },
];

describe("resizeGuiFields", () => {
  it("is the identity when from == to and never mutates input", () => {
    const copy = structuredClone(layout);
    const out = resizeGuiFields(layout, from, from);
    expect(out).toEqual(layout);
    expect(out).not.toBe(layout);
    expect(layout).toEqual(copy);
  });

  it("scales uniformly for a same-aspect target", () => {
    const out = resizeGuiFields(layout, from, { w: 1280, h: 960 });
    for (let i = 0; i < layout.length; i++) {
      const f = layout[i];
      expect(out[i]).toEqual({ path: f.path, left: f.left * 2, top: f.top * 2, width: f.width * 2, height: f.height * 2 });
    }
  });

  it("anchors edges and centres for a 16:9 target", () => {
    const to = { w: 1920, h: 1080 };
    const s = 1080 / 480; // 2.25: aspect-preserving factor
    const out = Object.fromEntries(resizeGuiFields(layout, from, to).map((r) => [r.path, r]));

    // full-screen background fills the whole target
    expect(out.BG).toEqual({ path: "BG", left: 0, top: 0, width: 1920, height: 1080 });
    // full-width bar stretches horizontally, keeps aspect vertically and stays bottom anchored
    expect(out.BOTTOMBAR.width).toBe(1920);
    expect(out.BOTTOMBAR.height).toBe(Math.round(40 * s));
    expect(out.BOTTOMBAR.top + out.BOTTOMBAR.height).toBe(1080);
    // element sizes keep aspect
    expect(out.TOPLEFT.width).toBe(Math.round(100 * s));
    expect(out.TOPLEFT.height).toBe(Math.round(50 * s));
    expect(out.TOPLEFT.left).toBe(Math.round(10 * s));
    expect(out.TOPLEFT.top).toBe(Math.round(10 * s));
    // right anchored: right edge stays at the right edge
    expect(out.RIGHT.left + out.RIGHT.width).toBe(1920);
    expect(out.RIGHT.top).toBe(Math.round(10 * s));
    // bottom anchored
    expect(out.BOTTOM.top + out.BOTTOM.height).toBe(1080);
    expect(out.BOTTOM.left).toBe(Math.round(10 * s));
    // centered stays centered
    expect(Math.abs(out.CENTER.left + out.CENTER.width / 2 - 960)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(out.CENTER.top + out.CENTER.height / 2 - 540)).toBeLessThanOrEqual(0.5);
    // free floating keeps scaled distance to top-left
    expect(out.FREE).toEqual({ path: "FREE", left: 450, top: 225, width: 90, height: 90 });
    // paths and order preserved
    expect(resizeGuiFields(layout, from, to).map((r) => r.path)).toEqual(layout.map((r) => r.path));
  });

  it("handles a right-anchored element with a margin", () => {
    const out = resizeGuiFields([{ path: "X", left: 600, top: 0, width: 40, height: 20 }], from, { w: 1920, h: 1080 });
    expect(out[0].left + out[0].width).toBe(1920);
  });

  it("supports non-rounded output and rejects bad sizes", () => {
    const out = resizeGuiFields([{ path: "X", left: 1, top: 1, width: 1, height: 1 }], from, { w: 1920, h: 1080 }, { round: false });
    expect(out[0].left).toBeCloseTo(2.25);
    expect(() => resizeGuiFields([], from, { w: 0, h: 1 })).toThrow(RangeError);
  });

  it("classifyAnchor reports the rule applied", () => {
    expect(classifyAnchor(0, 640, 640)).toBe("stretch");
    expect(classifyAnchor(540, 100, 640)).toBe("far");
    expect(classifyAnchor(220, 200, 640)).toBe("center");
    expect(classifyAnchor(10, 100, 640)).toBe("near");
  });
});
