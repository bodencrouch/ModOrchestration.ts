/**
 * DelDuplicate: inside the resolved source directories, when a file with
 * extension `arguments` (e.g. ".tpc") shares its base name with a file of
 * another extension (e.g. ".tga"), delete the `arguments` one.
 */

import { parentPath } from "../../fs/paths.js";
import type { Instruction, InstructionResult, ModComponent, ModOption } from "../../model/types.js";
import type { InstallContext } from "../context.js";
import { ActionError, checkCancelled, resolveSources, runAction } from "./common.js";

export function normalizeExtension(ext: string | undefined): string {
  const e = (ext ?? "").trim().toLowerCase();
  if (!e) return "";
  return e.startsWith(".") ? e : `.${e}`;
}

function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name.toLowerCase(), ext: "" };
  return { stem: name.slice(0, dot).toLowerCase(), ext: name.slice(dot).toLowerCase() };
}

/** Directories to scan and the duplicate files that would be removed. */
export async function findDuplicates(ctx: InstallContext, sources: readonly string[], ext: string): Promise<string[]> {
  const resolved = await resolveSources(ctx, sources);
  const dirs = new Set<string>();
  for (const src of resolved) {
    for (const m of src.matches) {
      const st = await ctx.fs.stat(m);
      if (!st) continue;
      dirs.add(st.isDirectory ? st.path : parentPath(st.path));
    }
  }
  const doomed: string[] = [];
  for (const dir of dirs) {
    checkCancelled(ctx);
    const groups = new Map<string, Array<{ path: string; ext: string }>>();
    for (const entry of await ctx.fs.readDir(dir)) {
      if (entry.isDirectory) continue;
      const { stem, ext: e } = splitName(entry.name);
      const list = groups.get(stem) ?? [];
      list.push({ path: entry.path, ext: e });
      groups.set(stem, list);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const withExt = list.filter((f) => f.ext === ext);
      const others = list.filter((f) => f.ext !== ext);
      if (withExt.length && others.length) doomed.push(...withExt.map((f) => f.path));
    }
  }
  return doomed;
}

export async function executeDelDuplicate(
  ctx: InstallContext,
  instruction: Instruction,
  mod: ModComponent,
  option?: ModOption,
): Promise<InstructionResult> {
  return runAction(ctx, instruction, mod, option, async (run) => {
    const ext = normalizeExtension(instruction.arguments);
    if (!ext) throw new ActionError("UnknownError", "DelDuplicate needs the file extension in `arguments` (e.g. \".tpc\")");
    const doomed = await findDuplicates(ctx, instruction.source, ext);
    for (const p of doomed) {
      checkCancelled(ctx);
      await ctx.fs.remove(p);
      run.touch(p);
      ctx.logger.info(`deleted duplicate "${p}"`);
    }
    run.note(`deleted ${doomed.length} duplicate ${ext} file(s)`);
  });
}
