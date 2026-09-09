/**
 * Rename: one source file gets a new name. `destination` is either a bare
 * file name (same directory) or a full placeholder path.
 */

import { containsPlaceholder, isAbsolutePath, joinPath, parentPath } from "../../fs/paths.js";
import type { Instruction, InstructionResult, ModComponent, ModOption } from "../../model/types.js";
import type { InstallContext } from "../context.js";
import { ActionError, requireDestination, resolveSources, runAction } from "./common.js";

/** Compute the rename target for a resolved source. */
export function renameTarget(ctx: InstallContext, source: string, destination: string): string {
  const dest = destination.trim();
  if (containsPlaceholder(dest) || isAbsolutePath(dest)) return ctx.resolver.resolve(dest);
  if (/[\\/]/.test(dest)) return ctx.resolver.resolve(joinPath(parentPath(source), dest));
  return joinPath(parentPath(source), dest);
}

export async function executeRename(
  ctx: InstallContext,
  instruction: Instruction,
  mod: ModComponent,
  option?: ModOption,
): Promise<InstructionResult> {
  return runAction(ctx, instruction, mod, option, async (run) => {
    const destRaw = requireDestination(instruction);
    const sources = await resolveSources(ctx, instruction.source);
    const matches = sources.flatMap((s) => s.matches);
    if (matches.length === 0) {
      throw new ActionError("FileNotFoundPre", `source not found: ${instruction.source.map((s) => `"${s}"`).join(", ")}`);
    }
    if (matches.length > 1) {
      throw new ActionError("UnknownError", `rename expects exactly one source file, ${matches.length} matched`);
    }
    const source = matches[0];
    const target = renameTarget(ctx, source, destRaw);
    const existing = await ctx.fs.resolveCase(target);
    if (existing !== undefined && existing.toLowerCase() !== source.toLowerCase()) {
      if (!instruction.overwrite) {
        ctx.logger.info(`rename: keeping existing "${existing}" (overwrite=false)`);
        run.note(`kept existing "${existing}"`);
        return;
      }
      await ctx.fs.remove(existing);
    }
    await ctx.fs.move(source, target);
    run.touch(source, target);
    run.note(`renamed "${source}" -> "${target}"`);
  });
}
