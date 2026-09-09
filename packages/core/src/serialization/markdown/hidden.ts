/**
 * Hidden metadata blocks embedded in guides as HTML comments:
 *
 *   <!-- [HIDDEN:MOD] ... [ENDHIDDEN] -->   (line based `Key = Value`, unquoted values)
 *   <!--<<ModSync>> ... -->                  (YAML)
 *   <!--<<ModSync:Config>> ... -->           (YAML, file-level config)
 */
import { parse as parseYaml } from "yaml";
import { isRecord, type UnknownRecord } from "../lenient.js";

const COMMENT_RE = /<!--([\s\S]*?)-->/g;

/** Remove HTML comments from `text`, returning the comment bodies separately. */
export function extractHtmlComments(text: string): { text: string; comments: string[] } {
  const comments: string[] = [];
  const stripped = text.replace(COMMENT_RE, (_m, body: string) => {
    comments.push(body);
    return "";
  });
  return { text: stripped, comments };
}

export const MODSYNC_MARKER = "<<ModSync>>";
export const MODSYNC_CONFIG_MARKER = "<<ModSync:Config>>";

export interface HiddenBlockResult {
  record?: UnknownRecord;
  error?: string;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    if (v.startsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(v);
        if (typeof parsed === "string") return parsed;
      } catch {
        /* fall through: not valid JSON escapes, keep raw */
      }
    }
    return v.slice(1, -1);
  }
  return v;
}

function splitArray(inner: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | undefined;
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = undefined;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map(unquote).filter((s) => s !== "");
}

function parseValue(raw: string): unknown {
  const v = raw.trim();
  if (v === "") return "";
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === "true";
  if (v.startsWith("[") && v.endsWith("]")) return splitArray(v.slice(1, -1));
  return unquote(v);
}

function appendValue(target: UnknownRecord, key: string, value: unknown): void {
  const existingKey = Object.keys(target).find((k) => k.toLowerCase() === key.toLowerCase());
  if (existingKey === undefined) {
    target[key] = value;
    return;
  }
  const existing = target[existingKey];
  const list = Array.isArray(existing) ? existing : [existing];
  target[existingKey] = list.concat(Array.isArray(value) ? value : [value]);
}

/**
 * Parse a `[HIDDEN:MOD] ... [ENDHIDDEN]` block (line based, values unquoted).
 * Supports `[[Instruction]]`, `[[Option]]` and `[[Option.Instruction]]` tables.
 * Returns undefined when the text is not such a block.
 */
export function parseHiddenModBlock(body: string): HiddenBlockResult {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*\[HIDDEN:MOD\]\s*$/i.test(l));
  if (start < 0) return {};
  const root: UnknownRecord = {};
  let target: UnknownRecord = root;
  let currentOption: UnknownRecord | undefined;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    if (/^\[ENDHIDDEN\]$/i.test(line)) break;
    const table = /^\[\[\s*([A-Za-z0-9_.]+)\s*\]\]$/.exec(line);
    if (table) {
      const name = table[1].toLowerCase();
      const rec: UnknownRecord = {};
      if (name === "option" || name === "options") {
        pushRecord(root, "Options", rec);
        currentOption = rec;
      } else if (/^options?\.instructions?$/.test(name) && currentOption) {
        pushRecord(currentOption, "Instructions", rec);
      } else if (name === "instruction" || name === "instructions") {
        pushRecord(root, "Instructions", rec);
      } else {
        return { error: `unknown hidden table [[${table[1]}]]` };
      }
      target = rec;
      continue;
    }
    if (/^\[[^\]]*\]$/.test(line)) continue; // stray single-bracket header
    const kv = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!kv) return { error: `cannot parse hidden line: ${line}` };
    appendValue(target, kv[1], parseValue(kv[2]));
  }
  return { record: root };
}

function pushRecord(parent: UnknownRecord, key: string, rec: UnknownRecord): void {
  const existing = parent[key];
  if (Array.isArray(existing)) existing.push(rec);
  else parent[key] = [rec];
}

/** Parse a `<<ModSync>>` YAML comment body. Returns undefined when the marker is absent. */
export function parseModSyncYamlBlock(body: string, marker: string = MODSYNC_MARKER): HiddenBlockResult {
  const idx = body.indexOf(marker);
  if (idx < 0) return {};
  const yamlText = body.slice(idx + marker.length);
  try {
    const parsed: unknown = parseYaml(yamlText);
    if (parsed === null || parsed === undefined) return { record: {} };
    if (!isRecord(parsed)) return { error: "ModSync block is not a YAML mapping" };
    return { record: parsed };
  } catch (err) {
    return { error: `invalid ModSync YAML block: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Find the first hidden mod block (either dialect) among comment bodies. */
export function findHiddenModRecord(comments: string[]): HiddenBlockResult {
  for (const c of comments) {
    if (c.includes(MODSYNC_CONFIG_MARKER)) continue;
    const yaml = parseModSyncYamlBlock(c);
    if (yaml.record || yaml.error) return yaml;
    const hidden = parseHiddenModBlock(c);
    if (hidden.record || hidden.error) return hidden;
  }
  return {};
}

/** Find a `<<ModSync:Config>>` block among comment bodies. */
export function findHiddenConfigRecord(comments: string[]): HiddenBlockResult {
  for (const c of comments) {
    const r = parseModSyncYamlBlock(c, MODSYNC_CONFIG_MARKER);
    if (r.record || r.error) return r;
  }
  return {};
}
