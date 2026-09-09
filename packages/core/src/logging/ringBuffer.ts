/**
 * A fixed-capacity ring buffer with monotonically increasing sequence numbers.
 *
 * Used by the server to replay events to a WebSocket client that reconnects
 * with the last sequence number it saw (`{ type: "replay", lastSeq }`).
 * Sequence numbers start at 1; `since(0)` returns everything still buffered.
 */
export interface RingEntry<T> {
  seq: number;
  item: T;
}

export class RingBuffer<T> {
  readonly capacity: number;
  private readonly slots: Array<RingEntry<T> | undefined>;
  private head = 0; // index of the next slot to write
  private count = 0;
  private seq = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`RingBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.slots = new Array<RingEntry<T> | undefined>(capacity);
  }

  /** Append an item and return the sequence number assigned to it. */
  push(item: T): number {
    const seq = ++this.seq;
    this.slots[this.head] = { seq, item };
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
    return seq;
  }

  /** The sequence number of the most recently pushed item (0 when empty). */
  get lastSeq(): number {
    return this.seq;
  }

  /** Number of items currently retained. */
  get size(): number {
    return this.count;
  }

  /** Sequence number of the oldest retained item (0 when empty). */
  get firstSeq(): number {
    if (this.count === 0) return 0;
    return this.seq - this.count + 1;
  }

  /**
   * Entries with a sequence number strictly greater than `seq`, oldest first.
   * If `seq` is older than the oldest retained entry the caller has missed
   * events; check `firstSeq` to detect that gap.
   */
  since(seq: number): RingEntry<T>[] {
    const out: RingEntry<T>[] = [];
    for (const e of this.entries()) if (e.seq > seq) out.push(e);
    return out;
  }

  /** All retained entries, oldest first. */
  entries(): RingEntry<T>[] {
    const out: RingEntry<T>[] = [];
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) {
      const e = this.slots[(start + i) % this.capacity];
      if (e) out.push(e);
    }
    return out;
  }

  /** Retained items, oldest first. */
  toArray(): T[] {
    return this.entries().map((e) => e.item);
  }

  clear(): void {
    this.slots.fill(undefined);
    this.head = 0;
    this.count = 0;
  }
}
