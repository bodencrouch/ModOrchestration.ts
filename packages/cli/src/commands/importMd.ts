import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import type { Command } from "commander";
import { mergeInstructionFiles, parseMarkdownBuild, serializeInstructionFile, type TargetGame } from "@modsync/core";
import { CliError, readInstructionFile, writeTextFile } from "./shared.js";

export interface ImportFlags {
  output?: string;
  merge?: string;
  game?: string;
  sourceUrl?: string;
  noAutoInstructions?: boolean;
  json?: boolean;
}

export async function runImportMd(mdPath: string, flags: ImportFlags): Promise<number> {
  const abs = resolvePath(mdPath);
  let text: string;
  try {
    text = await readFile(abs, "utf8");
  } catch (err) {
    throw new CliError(`Cannot read ${abs}: ${(err as Error).message}`);
  }
  let targetGame: TargetGame | undefined;
  if (flags.game) {
    const g = flags.game.toLowerCase().replace(/[^a-z0-9]/g, "");
    targetGame = g === "kotor1" || g === "k1" || g === "1" ? "KOTOR1" : g === "kotor2" || g === "k2" || g === "tsl" || g === "2" ? "KOTOR2" : undefined;
    if (!targetGame) throw new CliError("--game must be kotor1 or kotor2");
  }
  const imported = parseMarkdownBuild(text, {
    targetGame,
    sourceUrl: flags.sourceUrl ?? abs,
    autoInstructions: flags.noAutoInstructions ? false : undefined,
  });
  const log = (line: string): void => console.error(line);
  log(`Imported ${imported.file.mods.length} mods from ${abs}`);
  for (const w of imported.warnings) log(`  warning: ${w}`);

  let file = imported.file;
  if (flags.merge) {
    const existing = await readInstructionFile(flags.merge);
    const result = mergeInstructionFiles(existing.file, imported.file);
    file = result.file;
    log(`Merged into ${existing.path}: ${result.added.length} added, ${result.updated.length} updated, ${result.removed.length} removed, ${result.conflicts.length} conflicts`);
    const names = new Map(file.mods.map((m) => [m.guid, m.name]));
    for (const g of result.added) log(`  + ${names.get(g) ?? g}`);
    for (const g of result.removed) log(`  - ${g} (kept? no: removed from the merged file)`);
    for (const c of result.conflicts) {
      log(`  ! conflict in "${c.name}" (${c.guid}) field ${c.field}: existing kept`);
    }
    if (flags.json) console.log(JSON.stringify({ added: result.added, updated: result.updated, removed: result.removed, conflicts: result.conflicts }, null, 2));
  }

  const toml = serializeInstructionFile(file);
  if (flags.output) {
    const out = await writeTextFile(flags.output, toml);
    log(`Wrote ${out}`);
  } else if (!flags.json) {
    process.stdout.write(toml);
  }
  return 0;
}

export function registerImportMd(program: Command): void {
  program
    .command("import-md <markdown>")
    .description("convert a markdown mod build guide into an instruction file")
    .option("-o, --output <path>", "write the TOML here (default: stdout)")
    .option("--merge <existing.toml>", "merge into an existing instruction file, keeping its instructions")
    .option("--game <game>", "force the target game: kotor1 or kotor2")
    .option("--source-url <url>", "record where the markdown came from")
    .option("--no-auto-instructions", "do not generate heuristic instructions for mods without any")
    .option("--json", "print the merge result as JSON (with --merge)")
    .action(async (md: string, flags: ImportFlags & { autoInstructions?: boolean }) => {
      process.exitCode = await runImportMd(md, { ...flags, noAutoInstructions: flags.autoInstructions === false });
    });
}
