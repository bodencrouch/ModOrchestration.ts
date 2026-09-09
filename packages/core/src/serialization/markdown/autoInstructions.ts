/**
 * Heuristic instruction generation for guide entries that carry no structured
 * steps or hidden metadata. The result is a best guess and callers should warn.
 */
import { createInstruction } from "../../model/defaults.js";
import { PLACEHOLDER_KOTOR_DIRECTORY, PLACEHOLDER_MOD_DIRECTORY, type Instruction, type ModComponent } from "../../model/types.js";
import { stableChildGuid } from "./stableGuid.js";

const ARCHIVE_EXT_RE = /\.(zip|rar|7z)$/i;
const EXE_EXT_RE = /\.exe$/i;
const AUTO_NOTE = "auto-generated";

function fileNameFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    return last || undefined;
  } catch {
    const last = url.split(/[\\/]/).pop();
    return last || undefined;
  }
}

/** Characters that cannot appear in file names. */
export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, " ").trim();
}

export interface ArchiveGuess {
  /** Placeholder path (with wildcards) of the downloaded file. */
  pattern: string;
  /** Placeholder path of the folder the archive extracts into. */
  folder: string;
  /** True when the download itself is an executable installer. */
  isExecutable: boolean;
}

/** Guess where the mod's download lands in the mod directory. */
export function guessArchive(mod: ModComponent): ArchiveGuess {
  const mdir = PLACEHOLDER_MOD_DIRECTORY + "\\";
  const expected = mod.expectedFiles?.find((f) => ARCHIVE_EXT_RE.test(f) || EXE_EXT_RE.test(f)) ?? mod.expectedFiles?.[0];
  if (expected) {
    const file = expected.includes("<<") ? expected : mdir + expected;
    return { pattern: file, folder: file.replace(/\.[^.\\/]+$/, ""), isExecutable: EXE_EXT_RE.test(expected) };
  }
  for (const link of mod.modLink) {
    const name = fileNameFromUrl(link);
    if (name && (ARCHIVE_EXT_RE.test(name) || EXE_EXT_RE.test(name))) {
      return { pattern: mdir + name, folder: mdir + name.replace(/\.[^.]+$/, ""), isExecutable: EXE_EXT_RE.test(name) };
    }
  }
  const base = sanitizeFileName(mod.name) || "mod";
  return { pattern: `${mdir}${base}*.{zip,rar,7z}`, folder: `${mdir}${base}*`, isExecutable: false };
}

/**
 * Generate instructions from the mod's installation method and links:
 * archive -> Extract; TSLPatcher/HoloPatcher -> Patcher; Loose-File -> Move `*`
 * to Override; `.exe` downloads -> Execute.
 */
export function generateInstructionsFromDescription(mod: ModComponent): Instruction[] {
  const out: Instruction[] = [];
  const guess = guessArchive(mod);
  const next = (partial: Partial<Instruction>): Instruction => {
    const instr = createInstruction(partial.action ?? "Extract", {
      ...partial,
      guid: stableChildGuid(mod.guid, "auto", out.length),
      description: AUTO_NOTE,
    });
    out.push(instr);
    return instr;
  };
  const override = `${PLACEHOLDER_KOTOR_DIRECTORY}\\Override`;
  const method = mod.installationMethod;
  const text = `${mod.description ?? ""}\n${mod.directions ?? ""}`.toLowerCase();

  if (guess.isExecutable) {
    if (method === "Loose-File" || method === "TSLPatcher" || method === "HoloPatcher") {
      // A self-extracting installer that then needs manual steps: run it.
      next({ action: "Execute", source: [guess.pattern] });
    } else {
      next({ action: "Execute", source: [guess.pattern] });
    }
    return out;
  }

  next({ action: "Extract", source: [guess.pattern] });
  switch (method) {
    case "TSLPatcher":
    case "HoloPatcher":
      next({ action: "Patcher", source: [guess.folder], destination: PLACEHOLDER_KOTOR_DIRECTORY });
      break;
    case "Loose-File":
      next({ action: "Move", source: [`${guess.folder}\\*`], destination: override });
      break;
    case "Executable":
      next({ action: "Execute", source: [`${guess.folder}\\*.exe`] });
      break;
    case "Mixed":
      next({ action: "Patcher", source: [guess.folder], destination: PLACEHOLDER_KOTOR_DIRECTORY });
      break;
    default:
      if (/tslpatcher|holopatcher/.test(text)) next({ action: "Patcher", source: [guess.folder], destination: PLACEHOLDER_KOTOR_DIRECTORY });
      else if (/override/.test(text)) next({ action: "Move", source: [`${guess.folder}\\*`], destination: override });
      break;
  }
  return out;
}
