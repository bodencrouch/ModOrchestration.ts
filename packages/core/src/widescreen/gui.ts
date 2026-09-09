/**
 * Pure geometry for resizing KOTOR `.gui` layouts from one screen size to
 * another. The GFF plumbing (reading `EXTENT/LEFT/TOP/WIDTH/HEIGHT` fields
 * out of a `.gui` file and writing them back) lives with the kotor-formats
 * bridge; this module only decides where each rectangle goes.
 */

export interface GuiRect {
  /** GFF field path of the struct that owns the EXTENT (opaque to this module). */
  path: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScreenSize {
  w: number;
  h: number;
}

export interface ResizeOptions {
  /**
   * Fraction of the source size at which an element counts as touching the
   * far edge (right/bottom anchored) or the near edge. Default 0.95.
   */
  edgeThreshold?: number;
  /** Max distance (fraction of the source size) from the centre to count as centred. Default 0.02. */
  centerTolerance?: number;
  /** Round results to integers (GFF stores them as INT). Default true. */
  round?: boolean;
}

interface AxisInput {
  pos: number;
  len: number;
  from: number;
  to: number;
}

/**
 * Scale one axis. `scale` is the aspect-preserving factor used for sizes;
 * elements spanning (almost) the full source axis are stretched to fill.
 * `fin` rounds intermediate values so anchored edges land exactly.
 */
function resizeAxis(
  a: AxisInput,
  scale: number,
  edge: number,
  centerTol: number,
  fin: (n: number) => number,
): { pos: number; len: number } {
  const end = a.pos + a.len;
  const nearEdge = a.pos <= a.from * (1 - edge);
  const farEdge = end >= a.from * edge;
  const stretch = a.to / a.from;

  if (nearEdge && farEdge) {
    // Full-span element (backgrounds, bars): fill the new axis.
    const pos = fin(a.pos * stretch);
    return { pos, len: fin(end * stretch) - pos };
  }

  const len = fin(a.len * scale);
  const center = a.pos + a.len / 2;
  const centered = Math.abs(center - a.from / 2) <= a.from * centerTol;

  if (farEdge && !nearEdge) {
    // Keep the (scaled) distance to the far edge.
    return { pos: a.to - fin((a.from - end) * scale) - len, len };
  }
  if (centered) {
    return { pos: fin(a.to / 2 - len / 2 + (center - a.from / 2) * scale), len };
  }
  // Near edge or free-floating: keep the distance to the near edge.
  return { pos: fin(a.pos * scale), len };
}

/**
 * Compute new rectangles for a layout designed for `from` shown at `to`.
 *
 * Rules:
 * - Sizes scale by `min(to.w/from.w, to.h/from.h)` so elements keep their
 *   aspect ratio (a 4:3 source shown at 16:9 gets letterbox-free scaling
 *   with the extra width distributed by anchoring).
 * - Elements that span the whole source axis are stretched to the full
 *   target axis (backgrounds).
 * - Elements whose `left + width >= from.w * threshold` stay right-anchored;
 *   `top + height >= from.h * threshold` stay bottom-anchored.
 * - Centred elements stay centred.
 * - Everything else keeps its scaled distance to the top-left.
 *
 * The input is not modified; order and `path` are preserved.
 */
export function resizeGuiFields(
  fields: readonly GuiRect[],
  from: ScreenSize,
  to: ScreenSize,
  opts: ResizeOptions = {},
): GuiRect[] {
  if (from.w <= 0 || from.h <= 0 || to.w <= 0 || to.h <= 0) {
    throw new RangeError(`Screen sizes must be positive, got ${from.w}x${from.h} -> ${to.w}x${to.h}`);
  }
  const edge = opts.edgeThreshold ?? 0.95;
  const centerTol = opts.centerTolerance ?? 0.02;
  const round = opts.round ?? true;
  const scale = Math.min(to.w / from.w, to.h / from.h);
  const fin = (n: number) => (round ? Math.round(n) : n);

  return fields.map((f) => {
    const x = resizeAxis({ pos: f.left, len: f.width, from: from.w, to: to.w }, scale, edge, centerTol, fin);
    const y = resizeAxis({ pos: f.top, len: f.height, from: from.h, to: to.h }, scale, edge, centerTol, fin);
    return { path: f.path, left: x.pos, top: y.pos, width: x.len, height: y.len };
  });
}

/** Which anchoring `resizeGuiFields` would apply on one axis, for diagnostics/tests. */
export function classifyAnchor(pos: number, len: number, from: number, opts: ResizeOptions = {}): "stretch" | "far" | "center" | "near" {
  const edge = opts.edgeThreshold ?? 0.95;
  const centerTol = opts.centerTolerance ?? 0.02;
  const nearEdge = pos <= from * (1 - edge);
  const farEdge = pos + len >= from * edge;
  if (nearEdge && farEdge) return "stretch";
  if (farEdge) return "far";
  if (Math.abs(pos + len / 2 - from / 2) <= from * centerTol) return "center";
  return "near";
}
