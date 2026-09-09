/**
 * CleanList CSV: rows of `modName,file[,file...]` (or one file per row with
 * the mod name repeated). Blank lines and `#` comments are skipped.
 */
export interface CleanListEntry {
  modName: string;
  files: string[];
}

/** Minimal RFC 4180-ish CSV parser: quoted fields, embedded commas/quotes/newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const src = text.replace(/^﻿/, "");
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (ch === "\r" && src[i + 1] === "\n") i++;
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Parse a clean list CSV. Rows with the same mod name are merged. */
export function parseCleanList(csv: string): CleanListEntry[] {
  const entries: CleanListEntry[] = [];
  const index = new Map<string, CleanListEntry>();
  const rows = parseCsv(csv);
  let first = true;
  for (const raw of rows) {
    const cells = raw.map((c) => c.trim());
    if (cells.every((c) => c === "")) continue;
    if (cells[0].startsWith("#")) continue;
    if (first) {
      first = false;
      if (/^(mod ?name|mod|name)$/i.test(cells[0]) && (cells[1] === undefined || /^(files?|file ?names?|paths?)$/i.test(cells[1]))) continue;
    }
    const modName = cells[0];
    if (!modName) continue;
    const files = cells.slice(1).filter(Boolean);
    const key = normalizeName(modName);
    let entry = index.get(key);
    if (!entry) {
      entry = { modName, files: [] };
      index.set(key, entry);
      entries.push(entry);
    }
    for (const f of files) if (!entry.files.includes(f)) entry.files.push(f);
  }
  return entries;
}

/** True when the entry's mod name matches any selected name exactly (case-insensitive) or by containment either way. */
export function matchCleanListEntry(entry: CleanListEntry, selectedModNames: Iterable<string>): boolean {
  const key = normalizeName(entry.modName);
  if (!key) return false;
  for (const name of selectedModNames) {
    const n = normalizeName(name);
    if (!n) continue;
    if (n === key || n.includes(key) || key.includes(n)) return true;
  }
  return false;
}
