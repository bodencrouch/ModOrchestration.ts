/**
 * Fixture helpers shared by the engine tests (temp directories, zips built
 * with fflate, settings, prompt handlers). Not part of the runtime API.
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { zipSync } from "fflate";

import { toPosix } from "../fs/paths.js";
import { createDefaultSettings, createInstructionFile, createMod, createOption, createInstruction } from "../model/defaults.js";
import type { Instruction, InstructionFile, ModComponent, ModOption, UserSettings } from "../model/types.js";

export interface Sandbox {
  root: string;
  mods: string;
  kotor: string;
  settings: UserSettings;
  cleanup(): Promise<void>;
}

/** Create `<tmp>/mods` and `<tmp>/kotor/Override` and matching settings. */
export async function makeSandbox(prefix = "modsync-engine-"): Promise<Sandbox> {
  const root = toPosix(await mkdtemp(path.join(tmpdir(), prefix)));
  const mods = `${root}/mods`;
  const kotor = `${root}/kotor`;
  await mkdir(mods, { recursive: true });
  await mkdir(`${kotor}/Override`, { recursive: true });
  const settings = createDefaultSettings({ modDirectory: mods, kotorDirectory: kotor, createCheckpoints: false });
  return { root, mods, kotor, settings, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export function text(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Write a zip with the given entries (path -> content). */
export async function writeZip(file: string, entries: Record<string, string | Uint8Array>): Promise<void> {
  const data: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(entries)) data[k] = typeof v === "string" ? text(v) : v;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, zipSync(data));
}

export async function writeText(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

export const G = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function mod(n: number, partial: Partial<ModComponent> = {}): ModComponent {
  return createMod({ guid: G(n), name: `Mod ${n}`, isSelected: true, ...partial });
}

export function option(n: number, partial: Partial<ModOption> = {}): ModOption {
  return createOption({ guid: G(n), name: `Option ${n}`, isSelected: true, ...partial });
}

export function instr(action: Instruction["action"], partial: Partial<Instruction> = {}): Instruction {
  return createInstruction(action, partial);
}

export function file(mods: ModComponent[], config: Partial<InstructionFile["config"]> = {}): InstructionFile {
  return createInstructionFile({ config: { targetGame: "KOTOR1", compatibilityLevel: "Compatible", patcherEngine: "Native", spoilerFree: false, platform: "PC", ...config }, mods });
}
