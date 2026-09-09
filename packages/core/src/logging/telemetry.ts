import type { TelemetryEvent, TelemetrySink } from "../model/types.js";
import { RingBuffer } from "./ringBuffer.js";

/** Keeps the most recent events in memory (default 1000). */
export class InMemoryTelemetry implements TelemetrySink {
  private readonly buffer: RingBuffer<TelemetryEvent>;

  constructor(capacity = 1000) {
    this.buffer = new RingBuffer<TelemetryEvent>(capacity);
  }

  record(event: TelemetryEvent): void {
    this.buffer.push({ ...event });
  }

  /** Retained events, oldest first. */
  events(): TelemetryEvent[] {
    return this.buffer.toArray();
  }

  /** Total number of events ever recorded (including evicted ones). */
  get recorded(): number {
    return this.buffer.lastSeq;
  }

  clear(): void {
    this.buffer.clear();
  }

  /** Aggregate counts and durations per operation. */
  summary(): Record<string, { count: number; failures: number; totalMs: number }> {
    const out: Record<string, { count: number; failures: number; totalMs: number }> = {};
    for (const e of this.events()) {
      const s = (out[e.operation] ??= { count: 0, failures: 0, totalMs: 0 });
      s.count++;
      if (!e.success) s.failures++;
      s.totalMs += e.durationMs;
    }
    return out;
  }
}

/** Drops every event. */
export const NullTelemetry: TelemetrySink = { record() {} };

/**
 * Run `fn`, recording its duration and outcome on `sink`. Errors are re-thrown.
 */
export async function timed<T>(
  sink: TelemetrySink | undefined,
  operation: string,
  fn: () => Promise<T>,
  data?: Record<string, unknown>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    sink?.record({ operation, success: true, durationMs: performance.now() - start, data });
    return result;
  } catch (err) {
    sink?.record({
      operation,
      success: false,
      durationMs: performance.now() - start,
      data,
      errors: [err instanceof Error ? err.message : String(err)],
    });
    throw err;
  }
}
