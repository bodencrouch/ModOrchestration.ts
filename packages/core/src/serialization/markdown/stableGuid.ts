/**
 * Deterministic GUIDs (UUID v5 style, SHA-1 based) so that repeated imports
 * of the same guide produce the same identifiers.
 */
import { createHash } from "node:crypto";
import type { Guid } from "../../model/types.js";
import { normalizeGuid } from "../../model/guid.js";

/** Namespace for GUIDs derived from mod names. Arbitrary but fixed. */
export const MODSYNC_NAME_NAMESPACE: Guid = "7f0c3a4e-2b7d-4c1a-9f6e-5d8b1a2c3e4f";

function uuidBytes(guid: string): Uint8Array {
  const hex = normalizeGuid(guid).replace(/-/g, "");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** RFC 4122 version 5 UUID of `name` within `namespace`. */
export function uuidV5(namespace: Guid, name: string): Guid {
  const hash = createHash("sha1");
  hash.update(uuidBytes(namespace));
  hash.update(Buffer.from(name, "utf8"));
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Normalization applied to a mod name before hashing (case, whitespace, markdown links). */
export function normalizeNameForGuid(name: string): string {
  return name
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Deterministic GUID for a mod given its (display) name. */
export function stableGuidForName(name: string, discriminator = ""): Guid {
  return uuidV5(MODSYNC_NAME_NAMESPACE, normalizeNameForGuid(name) + (discriminator ? `#${discriminator}` : ""));
}

/** Deterministic GUID for the i-th generated child (instruction/option) of a parent GUID. */
export function stableChildGuid(parentGuid: Guid, kind: string, index: number): Guid {
  return uuidV5(parentGuid, `${kind}:${index}`);
}
