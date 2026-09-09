/**
 * Little-endian binary reader/writer helpers plus the CP-1252 codec used by
 * every KOTOR/Aurora format (labels, resrefs, CExoStrings, 2DA cells, TLK text
 * for languages 0-4).
 */

// Unicode code points for bytes 0x80-0x9F in Windows-1252. Bytes that are
// undefined in the code page (0x81, 0x8D, 0x8F, 0x90, 0x9D) decode to the C1
// control of the same value, matching the WHATWG decoder, so that an arbitrary
// byte sequence survives decode -> encode unchanged.
const CP1252_HIGH: readonly number[] = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122,
  0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

const CP1252_REVERSE = new Map<number, number>();
for (let i = 0; i < CP1252_HIGH.length; i++) CP1252_REVERSE.set(CP1252_HIGH[i]!, 0x80 + i);

/** Decode Windows-1252 bytes into a string. */
export function decodeCp1252(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b >= 0x80 && b <= 0x9f) out += String.fromCharCode(CP1252_HIGH[b - 0x80]!);
    else out += String.fromCharCode(b);
  }
  return out;
}

/**
 * Encode a string as Windows-1252. Characters that have no representation are
 * written as `?` (0x3F).
 */
export function encodeCp1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out[i] = c;
    else {
      const mapped = CP1252_REVERSE.get(c);
      out[i] = mapped ?? 0x3f;
    }
  }
  return out;
}

/** Returns true if every character of `text` is representable in CP-1252. */
export function isCp1252Representable(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) continue;
    if (!CP1252_REVERSE.has(c)) return false;
  }
  return true;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export class BinaryReader {
  private readonly view: DataView;
  private pos: number;

  constructor(
    readonly bytes: Uint8Array,
    offset = 0,
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = offset;
  }

  get position(): number {
    return this.pos;
  }
  set position(value: number) {
    if (value < 0 || value > this.bytes.length) throw new RangeError(`seek to ${value} outside buffer of ${this.bytes.length} bytes`);
    this.pos = value;
  }
  get length(): number {
    return this.bytes.length;
  }
  get remaining(): number {
    return this.bytes.length - this.pos;
  }

  seek(position: number): void {
    this.position = position;
  }
  skip(count: number): void {
    this.position = this.pos + count;
  }

  private need(n: number): number {
    if (this.pos + n > this.bytes.length) {
      throw new RangeError(`read of ${n} bytes at offset ${this.pos} exceeds buffer of ${this.bytes.length} bytes`);
    }
    const p = this.pos;
    this.pos += n;
    return p;
  }

  u8(): number {
    return this.view.getUint8(this.need(1));
  }
  i8(): number {
    return this.view.getInt8(this.need(1));
  }
  u16(): number {
    return this.view.getUint16(this.need(2), true);
  }
  i16(): number {
    return this.view.getInt16(this.need(2), true);
  }
  u32(): number {
    return this.view.getUint32(this.need(4), true);
  }
  i32(): number {
    return this.view.getInt32(this.need(4), true);
  }
  u64(): bigint {
    return this.view.getBigUint64(this.need(8), true);
  }
  i64(): bigint {
    return this.view.getBigInt64(this.need(8), true);
  }
  f32(): number {
    return this.view.getFloat32(this.need(4), true);
  }
  f64(): number {
    return this.view.getFloat64(this.need(8), true);
  }
  /** Read `n` raw bytes (copied). */
  bytes(n: number): Uint8Array {
    const p = this.need(n);
    return this.bytes.slice(p, p + n);
  }
  /** Read a fixed-size, null-padded CP-1252 string (stops at the first NUL). */
  fixedString(n: number): string {
    const raw = this.bytes(n);
    let end = raw.indexOf(0);
    if (end < 0) end = raw.length;
    return decodeCp1252(raw.subarray(0, end));
  }
  /** Read `n` bytes and decode them as CP-1252 verbatim (NULs preserved). */
  string(n: number): string {
    return decodeCp1252(this.bytes(n));
  }
  /** Read a NUL-terminated CP-1252 string; the terminator is consumed. */
  cstring(): string {
    let end = this.pos;
    while (end < this.bytes.length && this.bytes[end] !== 0) end++;
    const s = decodeCp1252(this.bytes.subarray(this.pos, end));
    this.pos = Math.min(end + 1, this.bytes.length);
    return s;
  }
  /** Read a string terminated by the given byte (terminator consumed). */
  stringUntil(terminator: number): string {
    let end = this.pos;
    while (end < this.bytes.length && this.bytes[end] !== terminator) end++;
    const s = decodeCp1252(this.bytes.subarray(this.pos, end));
    this.pos = Math.min(end + 1, this.bytes.length);
    return s;
  }
  peekU8(): number {
    if (this.pos >= this.bytes.length) throw new RangeError("peek past end of buffer");
    return this.bytes[this.pos]!;
  }
}

export class BinaryWriter {
  private buf: Uint8Array;
  private view: DataView;
  private len = 0;
  private pos = 0;

  constructor(initialCapacity = 1024) {
    this.buf = new Uint8Array(Math.max(16, initialCapacity));
    this.view = new DataView(this.buf.buffer);
  }

  get length(): number {
    return this.len;
  }
  get position(): number {
    return this.pos;
  }
  set position(value: number) {
    if (value < 0 || value > this.len) throw new RangeError(`seek to ${value} outside written range of ${this.len} bytes`);
    this.pos = value;
  }

  private ensure(n: number): number {
    const needed = this.pos + n;
    if (needed > this.buf.length) {
      let cap = this.buf.length * 2;
      while (cap < needed) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
      this.view = new DataView(next.buffer);
    }
    const p = this.pos;
    this.pos += n;
    if (this.pos > this.len) this.len = this.pos;
    return p;
  }

  u8(v: number): this {
    this.view.setUint8(this.ensure(1), v & 0xff);
    return this;
  }
  i8(v: number): this {
    this.view.setInt8(this.ensure(1), v);
    return this;
  }
  u16(v: number): this {
    this.view.setUint16(this.ensure(2), v & 0xffff, true);
    return this;
  }
  i16(v: number): this {
    this.view.setInt16(this.ensure(2), v, true);
    return this;
  }
  u32(v: number): this {
    this.view.setUint32(this.ensure(4), v >>> 0, true);
    return this;
  }
  i32(v: number): this {
    this.view.setInt32(this.ensure(4), v | 0, true);
    return this;
  }
  u64(v: bigint | number): this {
    this.view.setBigUint64(this.ensure(8), BigInt.asUintN(64, BigInt(v)), true);
    return this;
  }
  i64(v: bigint | number): this {
    this.view.setBigInt64(this.ensure(8), BigInt.asIntN(64, BigInt(v)), true);
    return this;
  }
  f32(v: number): this {
    this.view.setFloat32(this.ensure(4), v, true);
    return this;
  }
  f64(v: number): this {
    this.view.setFloat64(this.ensure(8), v, true);
    return this;
  }
  bytes(data: Uint8Array): this {
    const p = this.ensure(data.length);
    this.buf.set(data, p);
    return this;
  }
  /** Write `n` zero bytes. */
  zeros(n: number): this {
    const p = this.ensure(n);
    this.buf.fill(0, p, p + n);
    return this;
  }
  /** Write a CP-1252 string without any length prefix or terminator. */
  string(text: string): this {
    return this.bytes(encodeCp1252(text));
  }
  /** Write a CP-1252 string null-padded (or truncated) to exactly `n` bytes. */
  fixedString(text: string, n: number): this {
    const enc = encodeCp1252(text);
    const p = this.ensure(n);
    this.buf.fill(0, p, p + n);
    this.buf.set(enc.subarray(0, n), p);
    return this;
  }
  /** Write a CP-1252 string followed by a NUL byte. */
  cstring(text: string): this {
    this.string(text);
    return this.u8(0);
  }
  /** Overwrite a u32 at an absolute offset (does not move the cursor). */
  setU32At(offset: number, v: number): this {
    if (offset + 4 > this.len) throw new RangeError(`setU32At(${offset}) outside written range`);
    this.view.setUint32(offset, v >>> 0, true);
    return this;
  }
  setU16At(offset: number, v: number): this {
    if (offset + 2 > this.len) throw new RangeError(`setU16At(${offset}) outside written range`);
    this.view.setUint16(offset, v & 0xffff, true);
    return this;
  }
  /** Return a copy of the written bytes. */
  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

export { concatBytes };
