/**
 * Copy: like Move but the sources stay in place.
 */

import type { Instruction, InstructionResult, ModComponent, ModOption } from "../../model/types.js";
import type { InstallContext } from "../context.js";
import { executeTransfer } from "./move.js";

export function executeCopy(
  ctx: InstallContext,
  instruction: Instruction,
  mod: ModComponent,
  option?: ModOption,
): Promise<InstructionResult> {
  return executeTransfer(ctx, instruction, mod, option, "copy");
}
