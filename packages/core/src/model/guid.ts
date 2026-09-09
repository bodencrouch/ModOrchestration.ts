import { randomUUID } from "node:crypto";
import type { Guid } from "./types.js";

const GUID_RE = /^\{?([0-9a-fA-F]{8})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{4})-?([0-9a-fA-F]{12})\}?$/;

/** Create a new random GUID in canonical form. */
export function newGuid(): Guid {
  return randomUUID();
}

/** Returns true if the string is a GUID (with or without braces / hyphens). */
export function isGuid(value: unknown): value is Guid {
  return typeof value === "string" && GUID_RE.test(value.trim());
}

/**
 * Normalize any accepted GUID spelling to canonical lowercase hyphenated form
 * without braces. Throws on invalid input.
 */
export function normalizeGuid(value: string): Guid {
  const m = GUID_RE.exec(value.trim());
  if (!m) throw new Error(`Invalid GUID: ${JSON.stringify(value)}`);
  return `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}`.toLowerCase();
}

/** Normalize when possible, otherwise return the input unchanged (for lenient parsing). */
export function tryNormalizeGuid(value: string): string {
  return isGuid(value) ? normalizeGuid(value) : value;
}

/** Compare two GUIDs in any spelling. */
export function guidEquals(a: string, b: string): boolean {
  return tryNormalizeGuid(a) === tryNormalizeGuid(b);
}

/** Serialize in the braced uppercase form used by the original C# TOMLs. */
export function toBracedGuid(guid: Guid): string {
  return `{${normalizeGuid(guid).toUpperCase()}}`;
}
