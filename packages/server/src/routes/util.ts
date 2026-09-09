import type { FastifyReply } from "fastify";
import { HttpError } from "../state.js";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function bodyOf(raw: unknown): Record<string, unknown> {
  return isRecord(raw) ? raw : {};
}

export function requireString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `"${key}" must be a non-empty string`);
  return v;
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new HttpError(400, `"${key}" must be a string`);
  return v;
}

export function optionalStringArray(body: Record<string, unknown>, key: string): string[] | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new HttpError(400, `"${key}" must be an array of strings`);
  return v as string[];
}

export function queryString(query: unknown, key: string): string | undefined {
  if (!isRecord(query)) return undefined;
  const v = query[key];
  return typeof v === "string" ? v : undefined;
}

/** Map a node fs error to an HTTP status. */
export function fsErrorStatus(err: unknown): number {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case "ENOENT":
      return 404;
    case "ENOTDIR":
    case "EISDIR":
    case "ELOOP":
    case "ENAMETOOLONG":
      return 400;
    case "EACCES":
    case "EPERM":
      return 403;
    default:
      return 500;
  }
}

export function sendJsonNull(reply: FastifyReply): FastifyReply {
  return reply.type("application/json; charset=utf-8").send("null");
}
