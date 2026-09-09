/**
 * Delete: remove every matched file or directory. A source that matches
 * nothing is a warning, not a failure.
 */

import type { Instruction, InstructionResult, ModComponent, ModOption } from "../../model/types.js";
import type { InstallContext } from "../context.js";
import { checkCancelled, resolveSources, runAction } from "./common.js";

export async function executeDelete(
  ctx: InstallContext,
  instruction: Instruction,
  mod: ModComponent,
  option?: ModOption,
): Promise<InstructionResult> {
  return runAction(ctx, instruction, mod, option, async (run) => {
    const sources = await resolveSources(ctx, instruction.source);
    let deleted = 0;
    for (const src of sources) {
      if (src.matches.length === 0) {
        ctx.logger.warn(`delete: "${src.raw}" matched nothing`);
        run.note(`"${src.raw}" not found (already absent)`);
        continue;
      }
      for (const p of src.matches) {
        checkCancelled(ctx);
        await ctx.fs.remove(p);
        run.touch(p);
        deleted++;
      }
    }
    run.note(`deleted ${deleted} path(s)`);
  });
}
