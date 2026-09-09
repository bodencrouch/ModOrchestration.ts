/**
 * Choose: let the user pick one of several folders (contents moved to the
 * destination, default `<<kotorDirectory>>/Override`) or one of several
 * options (the chosen option becomes selected; its instructions run with the
 * mod's other selected options). Exactly one candidate, or an option that is
 * already selected, answers the question without prompting.
 */

import { baseName } from "../../fs/paths.js";
import { isGuid, normalizeGuid } from "../../model/guid.js";
import type { Guid, Instruction, InstructionResult, ModComponent, ModOption, UserPrompt } from "../../model/types.js";
import type { InstallContext } from "../context.js";
import { ActionError, promptId, resolveDestination, resolveSources, runAction, transferInto } from "./common.js";

export const DEFAULT_CHOOSE_DESTINATION = "<<kotorDirectory>>/Override";

/** True when every source of the instruction is a GUID (option mode). */
export function isOptionChoose(instruction: Instruction): boolean {
  return instruction.source.length > 0 && instruction.source.every((s) => isGuid(s.trim()));
}

function guidOf(s: string): Guid {
  return normalizeGuid(s.trim());
}

/** Folder candidates a folder-mode Choose would offer (directories only). */
export async function chooseFolderCandidates(ctx: InstallContext, instruction: Instruction): Promise<string[]> {
  const sources = await resolveSources(ctx, instruction.source);
  const dirs: string[] = [];
  for (const src of sources) {
    for (const m of src.matches) {
      const st = await ctx.fs.stat(m);
      if (st?.isDirectory && !dirs.includes(st.path)) dirs.push(st.path);
    }
  }
  return dirs;
}

async function chooseOption(ctx: InstallContext, instruction: Instruction, mod: ModComponent): Promise<ModOption> {
  const guids = instruction.source.map(guidOf);
  const findOption = (g: Guid): ModOption | undefined => {
    const local = mod.options.find((o) => o.guid === g);
    if (local) return local;
    for (const other of ctx.selection.mods) {
      const hit = other.options.find((o) => o.guid === g);
      if (hit) return hit;
    }
    return undefined;
  };
  const candidates: ModOption[] = [];
  for (const g of guids) {
    const local = findOption(g);
    if (!local) throw new ActionError("UnknownError", `Choose references unknown option GUID ${g}`);
    candidates.push(local);
  }
  const preselected = candidates.filter((o) => ctx.selection.selectedGuids.has(o.guid));
  let chosen: ModOption | undefined;
  if (preselected.length >= 1) chosen = preselected[0];
  else if (candidates.length === 1) chosen = candidates[0];
  else {
    const prompt: UserPrompt = {
      id: promptId(instruction),
      kind: "choose-option",
      title: `${mod.name}: choose an option`,
      message: instruction.description ?? `Pick one of the options of "${mod.name}".`,
      choices: candidates.map((o, i) => ({ id: o.guid, label: o.name, description: o.description, isDefault: i === 0 })),
      modGuid: mod.guid,
      instructionGuid: instruction.guid,
    };
    const answer = await ctx.prompt(prompt);
    if (answer.choiceId === undefined) throw new ActionError("UserCancelled", "no option chosen");
    chosen = candidates.find((o) => o.guid === answer.choiceId);
    if (!chosen) throw new ActionError("UnknownError", `invalid option choice "${answer.choiceId}"`);
  }
  // Record the decision in the selection so the installer runs the option.
  for (const o of candidates) {
    if (o === chosen) continue;
    ctx.selection.selectedGuids.delete(o.guid);
    ctx.selection.options.delete(o.guid);
  }
  ctx.selection.selectedGuids.add(chosen.guid);
  ctx.selection.options.set(chosen.guid, chosen);
  return chosen;
}

export async function executeChoose(
  ctx: InstallContext,
  instruction: Instruction,
  mod: ModComponent,
  option?: ModOption,
): Promise<InstructionResult> {
  return runAction(ctx, instruction, mod, option, async (run) => {
    if (instruction.source.length === 0) throw new ActionError("UnknownError", "Choose instruction has no source");
    if (isOptionChoose(instruction)) {
      const chosen = await chooseOption(ctx, instruction, mod);
      run.note(`option "${chosen.name}" selected`);
      return;
    }
    const candidates = await chooseFolderCandidates(ctx, instruction);
    if (candidates.length === 0) {
      throw new ActionError("FileNotFoundPre", `no folder matched ${instruction.source.map((s) => `"${s}"`).join(", ")}`);
    }
    let chosen: string;
    if (candidates.length === 1) {
      chosen = candidates[0];
    } else {
      const prompt: UserPrompt = {
        id: promptId(instruction),
        kind: "choose-folder",
        title: `${mod.name}: choose a folder`,
        message: instruction.description ?? `Pick which folder of "${mod.name}" to install.`,
        choices: candidates.map((p, i) => ({ id: p, label: baseName(p), description: p, isDefault: i === 0 })),
        modGuid: mod.guid,
        instructionGuid: instruction.guid,
      };
      const answer = await ctx.prompt(prompt);
      if (answer.choiceId === undefined) throw new ActionError("UserCancelled", "no folder chosen");
      const hit = candidates.find((c) => c === answer.choiceId || c.toLowerCase() === answer.choiceId!.toLowerCase());
      if (!hit) throw new ActionError("UnknownError", `invalid folder choice "${answer.choiceId}"`);
      chosen = hit;
    }
    const dest = await resolveDestination(ctx, instruction.destination?.trim() || DEFAULT_CHOOSE_DESTINATION);
    const children = (await ctx.fs.readDir(chosen)).map((e) => e.path);
    const { transferred, skipped } = await transferInto(ctx, run, children, dest, "move", instruction.overwrite);
    run.note(`"${baseName(chosen)}": moved ${transferred} file(s) to "${dest}"${skipped ? `, kept ${skipped} existing` : ""}`);
  });
}
