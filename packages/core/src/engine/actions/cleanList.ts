/**
 * CleanList: `source[0]` is a CSV of `modName,file...`; for each entry whose
 * mod name matches a selected mod or option name, the listed files are
 * removed from `destination`. This replaces the `.bat` compatibility scripts
 * shipped by some mods.
 */

import { joinPath } from "../../fs/paths.js";
import { resolveWildcards } from "../../fs/wildcards.js";
import type { Instruction, InstructionResult, ModComponent, ModOption } from "../../model/types.js";
import { matchCleanListEntry, parseCleanList, type CleanListEntry } from "../../serialization/cleanlist.js";
import type { InstallContext } from "../context.js";
import { ActionError, checkCancelled, requireDestination, resolveDestination, resolveSources, runAction } from "./common.js";

/** Names the clean list is matched against: every selected mod and option. */
export function selectedNames(ctx: InstallContext): string[] {
  const names: string[] = [];
  for (const mod of ctx.selection.mods) names.push(mod.name);
  for (const option of ctx.selection.options.values()) names.push(option.name);
  return names;
}

/** Files under `destDir` that the matching entries would remove. */
export async function planCleanList(
  ctx: InstallContext,
  entries: CleanListEntry[],
  destDir: string,
): Promise<Array<{ entry: CleanListEntry; file: string; matches: string[] }>> {
  const names = selectedNames(ctx);
  const plan: Array<{ entry: CleanListEntry; file: string; matches: string[] }> = [];
  for (const entry of entries) {
    if (!matchCleanListEntry(entry, names)) continue;
    for (const file of entry.files) {
      checkCancelled(ctx);
      const pattern = joinPath(destDir, file);
      const matches = await resolveWildcards(ctx.fs, pattern);
      plan.push({ entry, file, matches });
    }
  }
  return plan;
}

export async function executeCleanList(
  ctx: InstallContext,
  instruction: Instruction,
  mod: ModComponent,
  option?: ModOption,
): Promise<InstructionResult> {
  return runAction(ctx, instruction, mod, option, async (run) => {
    if (instruction.source.length === 0) throw new ActionError("UnknownError", "CleanList instruction has no source");
    const destRaw = requireDestination(instruction);
    const sources = await resolveSources(ctx, [instruction.source[0]]);
    const csvPath = sources[0].matches[0];
    if (!csvPath) throw new ActionError("FileNotFoundPre", `clean list not found: "${instruction.source[0]}"`);
    const destDir = await resolveDestination(ctx, destRaw);
    const destStat = await ctx.fs.stat(destDir);
    if (!destStat?.isDirectory) throw new ActionError("FileNotFoundPre", `clean list destination is not a directory: "${destRaw}"`);
    const entries = parseCleanList(new TextDecoder("utf-8").decode(await ctx.fs.readFile(csvPath)));
    const plan = await planCleanList(ctx, entries, destDir);
    let deleted = 0;
    const matchedMods = new Set<string>();
    for (const step of plan) {
      matchedMods.add(step.entry.modName);
      if (step.matches.length === 0) {
        ctx.logger.debug(`cleanlist: "${step.file}" not present in "${destDir}"`);
        continue;
      }
      for (const p of step.matches) {
        checkCancelled(ctx);
        await ctx.fs.remove(p);
        run.touch(p);
        deleted++;
      }
    }
    run.note(`${matchedMods.size} matching entr${matchedMods.size === 1 ? "y" : "ies"}, deleted ${deleted} file(s) from "${destDir}"`);
  });
}
