import { describe, expect, it } from "vitest";
import { SSF_SOUND_NAMES, createSsf, readSsf, ssfSoundIndex, writeSsf } from "./ssf.js";

describe("ssf", () => {
  it("has 28 names in TSLPatcher spelling", () => {
    expect(SSF_SOUND_NAMES).toHaveLength(28);
    expect(SSF_SOUND_NAMES[0]).toBe("Battlecry 1");
    expect(SSF_SOUND_NAMES[27]).toBe("Poisoned");
    expect(ssfSoundIndex("battlecry 1")).toBe(0);
    expect(ssfSoundIndex("Pick lock done")).toBe(24);
    expect(ssfSoundIndex("nope")).toBe(-1);
  });
  it("round-trips", () => {
    const s = createSsf();
    s.sounds[0] = 100;
    s.sounds[27] = 123456;
    const bytes = writeSsf(s);
    expect(bytes.length).toBe(12 + 40 * 4);
    const back = readSsf(bytes);
    expect(back.sounds).toEqual(s.sounds);
    expect(back.sounds[1]).toBe(-1);
    // a 124-byte (28-entry) file also reads
    expect(readSsf(bytes.subarray(0, 124)).sounds).toEqual(s.sounds);
  });
});
