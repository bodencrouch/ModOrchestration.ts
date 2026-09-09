/**
 * Move: every resolved source (file or directory) goes into the destination
 * directory. Directories merge; `overwrite=false` keeps existing files.
 */

import type { Instruction, InstructionResult, ModComponent, ModOption } from "../../model/types.js";
import type { InstallContext } from "../context.js";
import { ActionError, requireDestination, resolveDestination, resolveSources, runAction, transferInto } from "./common.js";

export async function executeTransfer(
  ctx: InstallContext,
  instruction: Instruction,
  mod: ModComponent,
  option: ModOption | undefined,
  mode: "move" | "copy",
): Promise<InstructionResult> {
  return runAction(ctx, instruction, mod, option, async (run) => {
    const destRaw = requireDestination(instruction);
    const sources = await resolveSources(ctx, instruction.source);
    const missing = sources.filter((s) => s.matches.length === 0);
    if (missing.length) {
      throw new ActionError("FileNotFoundPre", `source not found: ${missing.map((m) => `"${m.raw}"`).join(", ")}`);
    }
    const dest = await resolveDestination(ctx, destRaw);
    const all = sources.flatMap((s) => s.matches);
    const { transferred, skipped } = await transferInto(ctx, run, all, dest, mode, instruction.overwrite);
    run.note(`${mode === "move" ? "moved" : "copied"} ${transferred} file(s) to "${dest}"${skipped ? `, kept ${skipped} existing` : ""}`);
  });
}

export function executeMove(
  ctx: InstallContext,
  instruction: Instruction,
  mod: ModComponent,
  option?: ModOption,
): Promise<InstructionResult> {
  return executeTransfer(ctx, instruction, mod, option, "move");
}
