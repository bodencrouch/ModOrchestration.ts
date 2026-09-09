import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, NullLogger, formatLogLine } from "./logger.js";
import { InMemoryTelemetry, NullTelemetry, timed } from "./telemetry.js";
import { RingBuffer } from "./ringBuffer.js";

describe("createLogger", () => {
  it("filters by level and formats lines with ISO timestamps", () => {
    const lines: string[] = [];
    const log = createLogger({ level: "info", sink: (l) => lines.push(l) });
    log.debug("hidden");
    log.info("hello", { a: 1 });
    log.warn("careful");
    log.error("boom", new Error("bad"));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO \] hello \{ a: 1 \}$/);
    expect(lines[1]).toContain("[WARN ] careful");
    expect(lines[2]).toContain("[ERROR] boom");
    expect(lines[2]).toContain("bad");
    expect(log.isEnabled("debug")).toBe(false);
    expect(log.isEnabled("info")).toBe(true);
  });

  it("child loggers prefix messages and nest", () => {
    const lines: string[] = [];
    const log = createLogger({ level: "debug", sink: (l) => lines.push(l) });
    const child = log.child("installer");
    child.child("extract").debug("x");
    expect(lines[0]).toContain("installer/extract: x");
    expect(child.level).toBe("debug");
  });

  it("appends lines to a file sink in order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "modsync-log-"));
    const file = join(dir, "nested", "modsync.log");
    const log = createLogger({ level: "info", file });
    for (let i = 0; i < 20; i++) log.info(`line ${i}`);
    await log.flush();
    const text = await readFile(file, "utf8");
    const lines = text.trimEnd().split("\n");
    expect(lines).toHaveLength(20);
    lines.forEach((l, i) => expect(l).toMatch(new RegExp(`Z \\[INFO \\] line ${i}$`)));
  });

  it("silent level emits nothing and NullLogger is inert", () => {
    const lines: string[] = [];
    const log = createLogger({ level: "silent", sink: (l) => lines.push(l) });
    log.error("nope");
    expect(lines).toEqual([]);
    NullLogger.error("nope");
    expect(NullLogger.child("x")).toBe(NullLogger);
  });

  it("formatLogLine uses the supplied date", () => {
    const d = new Date("2026-01-02T03:04:05.678Z");
    expect(formatLogLine("warn", "msg", [], "p", d)).toBe("2026-01-02T03:04:05.678Z [WARN ] p: msg");
  });
});

describe("InMemoryTelemetry", () => {
  it("keeps only the last 1000 events by default", () => {
    const t = new InMemoryTelemetry();
    for (let i = 0; i < 1500; i++) t.record({ operation: `op${i}`, success: true, durationMs: i });
    const events = t.events();
    expect(events).toHaveLength(1000);
    expect(events[0].operation).toBe("op500");
    expect(events[999].operation).toBe("op1499");
    expect(t.recorded).toBe(1500);
  });

  it("summarizes per operation and timed() records outcomes", async () => {
    const t = new InMemoryTelemetry(10);
    await timed(t, "ok", async () => 1);
    await expect(timed(t, "fail", async () => { throw new Error("x"); })).rejects.toThrow("x");
    const s = t.summary();
    expect(s.ok.count).toBe(1);
    expect(s.fail.failures).toBe(1);
    expect(t.events()[1].errors).toEqual(["x"]);
    NullTelemetry.record({ operation: "n", success: true, durationMs: 0 });
  });
});

describe("RingBuffer", () => {
  it("assigns increasing seqs and replays since a seq", () => {
    const rb = new RingBuffer<string>(3);
    expect(rb.lastSeq).toBe(0);
    expect(rb.push("a")).toBe(1);
    rb.push("b");
    rb.push("c");
    rb.push("d"); // evicts a
    expect(rb.size).toBe(3);
    expect(rb.lastSeq).toBe(4);
    expect(rb.firstSeq).toBe(2);
    expect(rb.toArray()).toEqual(["b", "c", "d"]);
    expect(rb.since(2).map((e) => e.item)).toEqual(["c", "d"]);
    expect(rb.since(4)).toEqual([]);
    expect(rb.since(0).map((e) => e.seq)).toEqual([2, 3, 4]);
    rb.clear();
    expect(rb.size).toBe(0);
    expect(rb.lastSeq).toBe(4);
    expect(rb.push("e")).toBe(5);
  });

  it("rejects a non-positive capacity", () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
  });
});
