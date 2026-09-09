/**
 * INI parser tuned for TSLPatcher `changes.ini` files.
 *
 * - Sections `[Name]`; section order preserved; lookup case-insensitive.
 *   A repeated section name merges its entries into the first occurrence.
 * - `Key=Value`; the first `=` splits, so values may contain `=`.
 *   Keys without `=` are kept with an empty value.
 * - Full-line comments start with `;` or `#`. There are no inline comments
 *   (TSLPatcher values legitimately contain `;`).
 * - UTF-8 BOM and CRLF tolerated. Keys/values are trimmed.
 * - Duplicate keys: `get()` returns the last one; `entries` keeps them all in
 *   file order so numeric-suffix ordering can be reconstructed.
 */

export interface IniEntry {
  key: string;
  value: string;
  /** 1-based line number */
  line: number;
}

export class IniSection {
  readonly entries: IniEntry[] = [];
  constructor(
    readonly name: string,
    readonly line: number,
  ) {}

  /** Last value for a key (case-insensitive) or undefined. */
  get(key: string): string | undefined {
    const lower = key.toLowerCase();
    let found: string | undefined;
    for (const e of this.entries) if (e.key.toLowerCase() === lower) found = e.value;
    return found;
  }

  has(key: string): boolean {
    const lower = key.toLowerCase();
    return this.entries.some((e) => e.key.toLowerCase() === lower);
  }

  /** All values for a key in file order. */
  getAll(key: string): string[] {
    const lower = key.toLowerCase();
    return this.entries.filter((e) => e.key.toLowerCase() === lower).map((e) => e.value);
  }

  /**
   * Entries whose key is `<prefix><digits>` (case-insensitive), sorted by the
   * numeric suffix (stable for ties).
   */
  numbered(prefix: string): (IniEntry & { index: number })[] {
    const out: (IniEntry & { index: number })[] = [];
    for (const e of this.entries) {
      const n = numericSuffix(e.key, prefix);
      if (n !== undefined) out.push({ ...e, index: n });
    }
    return out.sort((a, b) => a.index - b.index);
  }
}

export class IniDocument {
  readonly sections: IniSection[] = [];

  getSection(name: string): IniSection | undefined {
    const lower = name.toLowerCase();
    return this.sections.find((s) => s.name.toLowerCase() === lower);
  }

  hasSection(name: string): boolean {
    return this.getSection(name) !== undefined;
  }

  get sectionNames(): string[] {
    return this.sections.map((s) => s.name);
  }
}

/** Numeric suffix of `key` when it is exactly `<prefix><digits>` (case-insensitive). */
export function numericSuffix(key: string, prefix: string): number | undefined {
  if (key.length <= prefix.length) return undefined;
  if (key.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return undefined;
  const rest = key.slice(prefix.length);
  return /^\d+$/.test(rest) ? Number(rest) : undefined;
}

/**
 * Reorder `entries` so that those whose key matches one of `prefixes` followed
 * by digits are sorted by that number (stable), occupying the same slots those
 * entries held in file order. Entries that match no prefix stay put.
 */
export function orderByNumericSuffix<T extends { key: string }>(entries: readonly T[], prefixes: readonly string[]): T[] {
  const slots: number[] = [];
  const numbered: { entry: T; n: number; pos: number }[] = [];
  entries.forEach((e, pos) => {
    for (const p of prefixes) {
      const n = numericSuffix(e.key, p);
      if (n !== undefined) {
        slots.push(pos);
        numbered.push({ entry: e, n, pos });
        break;
      }
    }
  });
  numbered.sort((a, b) => a.n - b.n || a.pos - b.pos);
  const out = [...entries];
  slots.forEach((slot, i) => {
    out[slot] = numbered[i]!.entry;
  });
  return out;
}

export function parseIni(text: string): IniDocument {
  const doc = new IniDocument();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r\n|\r|\n/);
  let current: IniSection | undefined;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "" || line.startsWith(";") || line.startsWith("#")) continue;
    if (line.startsWith("[")) {
      const end = line.indexOf("]");
      const name = (end < 0 ? line.slice(1) : line.slice(1, end)).trim();
      const existing = doc.getSection(name);
      if (existing) current = existing;
      else {
        current = new IniSection(name, i + 1);
        doc.sections.push(current);
      }
      continue;
    }
    if (!current) {
      current = new IniSection("", i + 1);
      doc.sections.push(current);
    }
    const eq = line.indexOf("=");
    if (eq < 0) current.entries.push({ key: line, value: "", line: i + 1 });
    else current.entries.push({ key: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim(), line: i + 1 });
  }
  return doc;
}
