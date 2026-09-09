import type { Command } from "commander";
import { validate } from "@modsync/core";
import { applySelectionFlags, printIssues, readInstructionFile, settingsFromFlags, type DirectoryFlags } from "./shared.js";

interface ValidateFlags extends DirectoryFlags {
  json?: boolean;
  select?: string[];
  allEssential?: boolean;
  all?: boolean;
  quiet?: boolean;
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function addDirectoryOptions(cmd: Command): Command {
  return cmd
    .option("--mods <dir>", "mod directory (archives live here)")
    .option("--kotor <dir>", "KOTOR installation directory")
    .option("--settings <path>", "settings file to read directories and engine from")
    .option("--engine <engine>", "patcher engine: native, holopatcher or tslpatcher")
    .option("--spoiler-free", "hide full-build-only mods (spoiler-free build)")
    .option("--platform <platform>", "pc or mobile")
    .option("--compat <level>", "compatibility level: compatible, untested or incompatible");
}

export function addSelectionOptions(cmd: Command): Command {
  return cmd
    .option("--select <guids>", "select exactly these mod/option GUIDs (comma separated, repeatable)", collect)
    .option("--all-essential", "select every Essential mod")
    .option("--all", "select every mod");
}

export async function runValidate(filePath: string, flags: ValidateFlags): Promise<number> {
  const loaded = await readInstructionFile(filePath);
  applySelectionFlags(loaded.file, flags);
  const settings = await settingsFromFlags(flags);
  const report = await validate(loaded.file, settings);
  if (flags.json) {
    console.log(JSON.stringify({ file: loaded.path, warnings: loaded.warnings, ...report }, null, 2));
  } else {
    if (loaded.warnings.length && !flags.quiet) {
      console.log(`Parser warnings (${loaded.warnings.length}):`);
      for (const w of loaded.warnings) console.log(`  ${w}`);
    }
    const selected = loaded.file.mods.filter((m) => m.isSelected).length;
    console.log(`Validated ${loaded.path}: ${loaded.file.mods.length} mods, ${selected} selected, ${report.installOrder.length} in install order`);
    printIssues(report.issues, loaded.file, (l) => console.log(l));
    const missing = report.requiredDownloads.filter((d) => !d.found);
    if (missing.length) {
      console.log(`Missing downloads (${missing.length}):`);
      for (const d of missing) console.log(`  ${d.modName}: ${d.pattern}${d.links.length ? `  <- ${d.links.join(" ")}` : ""}`);
    }
    console.log(report.ok ? "OK: no errors." : "FAILED: errors found.");
  }
  return report.ok ? 0 : 1;
}

export function registerValidate(program: Command): void {
  const cmd = program
    .command("validate <file>")
    .description("check an instruction file and dry-run it against a virtual file system")
    .option("--json", "machine-readable output")
    .option("--quiet", "do not print parser warnings");
  addDirectoryOptions(cmd);
  addSelectionOptions(cmd);
  cmd.action(async (file: string, flags: ValidateFlags) => {
    process.exitCode = await runValidate(file, flags);
  });
}
