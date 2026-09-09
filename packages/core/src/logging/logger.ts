import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { inspect } from "node:util";
import type { Logger } from "../model/types.js";

export const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

export interface CreateLoggerOptions {
  /** Minimum level that is emitted. Default "info". */
  level?: LogLevel;
  /** Append formatted lines (with ISO timestamps) to this file. Created on demand. */
  file?: string;
  /** Receive every formatted line (same text as the file sink). */
  sink?: (line: string) => void;
  /** Also print to the console (stderr for warn/error). Default false. */
  console?: boolean;
  /** Prefix prepended to every message, e.g. "installer". */
  prefix?: string;
}

/** A `Logger` that can spawn prefixed children and be flushed. */
export interface ModSyncLogger extends Logger {
  readonly level: LogLevel;
  /** A logger sharing the same sinks whose messages are prefixed with `prefix`. */
  child(prefix: string): ModSyncLogger;
  /** Resolves once every queued file write has completed. */
  flush(): Promise<void>;
  /** True when a message at `level` would be emitted. */
  isEnabled(level: LogLevel): boolean;
}

/** Format one log line: `<ISO timestamp> [LEVEL] <prefix: >message <meta...>`. */
export function formatLogLine(
  level: LogLevel,
  message: string,
  meta: unknown[],
  prefix?: string,
  now: Date = new Date(),
): string {
  const head = `${now.toISOString()} [${level.toUpperCase().padEnd(5)}] `;
  const body = prefix ? `${prefix}: ${message}` : message;
  const tail = meta.length ? " " + meta.map(formatMeta).join(" ") : "";
  return head + body + tail;
}

function formatMeta(m: unknown): string {
  if (m instanceof Error) return m.stack ?? `${m.name}: ${m.message}`;
  if (typeof m === "string") return m;
  return inspect(m, { depth: 4, breakLength: Infinity, compact: true });
}

/** Serialized appender so lines land in order even though writes are async. */
class FileSink {
  private chain: Promise<void> = Promise.resolve();
  private ready = false;
  constructor(private readonly path: string) {}

  write(line: string): void {
    this.chain = this.chain
      .then(async () => {
        if (!this.ready) {
          await mkdir(dirname(this.path), { recursive: true });
          this.ready = true;
        }
        await appendFile(this.path, line + "\n", "utf8");
      })
      .catch(() => {
        /* a failing log file must never break the app */
      });
  }

  flush(): Promise<void> {
    return this.chain;
  }
}

interface Shared {
  level: LogLevel;
  file?: FileSink;
  sink?: (line: string) => void;
  console: boolean;
}

function makeLogger(shared: Shared, prefix: string | undefined): ModSyncLogger {
  const emit = (level: Exclude<LogLevel, "silent">, message: string, meta: unknown[]): void => {
    if (LEVEL_RANK[level] < LEVEL_RANK[shared.level]) return;
    const line = formatLogLine(level, message, meta, prefix);
    if (shared.sink) {
      try {
        shared.sink(line);
      } catch {
        /* ignore sink failures */
      }
    }
    shared.file?.write(line);
    if (shared.console) {
      if (level === "error" || level === "warn") console.error(line);
      else console.log(line);
    }
  };
  return {
    get level() {
      return shared.level;
    },
    debug: (m, ...meta) => emit("debug", m, meta),
    info: (m, ...meta) => emit("info", m, meta),
    warn: (m, ...meta) => emit("warn", m, meta),
    error: (m, ...meta) => emit("error", m, meta),
    isEnabled: (level) => level !== "silent" && LEVEL_RANK[level] >= LEVEL_RANK[shared.level],
    child: (childPrefix) => makeLogger(shared, prefix ? `${prefix}/${childPrefix}` : childPrefix),
    flush: () => shared.file?.flush() ?? Promise.resolve(),
  };
}

export function createLogger(opts: CreateLoggerOptions = {}): ModSyncLogger {
  const shared: Shared = {
    level: opts.level ?? "info",
    file: opts.file ? new FileSink(opts.file) : undefined,
    sink: opts.sink,
    console: opts.console ?? false,
  };
  return makeLogger(shared, opts.prefix);
}

/** Discards everything. */
export const NullLogger: ModSyncLogger = {
  level: "silent",
  debug() {},
  info() {},
  warn() {},
  error() {},
  isEnabled: () => false,
  child() {
    return NullLogger;
  },
  flush: () => Promise.resolve(),
};
