import type { Command } from "commander";
import { generateMarkdownDocs, type MarkdownStyle } from "@modsync/core";
import { CliError, readInstructionFile, writeTextFile } from "./shared.js";

const STYLES: MarkdownStyle[] = ["reddit", "deadlystream", "structured"];

export async function runDocs(filePath: string, flags: { style?: string; output?: string }): Promise<number> {
  const style = (flags.style ?? "deadlystream").toLowerCase() as MarkdownStyle;
  if (!STYLES.includes(style)) throw new CliError(`--style must be one of ${STYLES.join(", ")}`);
  const loaded = await readInstructionFile(filePath);
  const markdown = generateMarkdownDocs(loaded.file, style);
  if (flags.output) {
    const abs = await writeTextFile(flags.output, markdown);
    console.error(`Wrote ${abs} (${loaded.file.mods.length} mods, ${style} style)`);
  } else {
    process.stdout.write(markdown);
  }
  return 0;
}

export function registerDocs(program: Command): void {
  program
    .command("docs <file>")
    .description("generate the human-readable markdown guide from an instruction file")
    .option("--style <style>", `markdown style: ${STYLES.join(", ")}`, "deadlystream")
    .option("-o, --output <path>", "write to this file instead of stdout")
    .action(async (file: string, flags: { style?: string; output?: string }) => {
      process.exitCode = await runDocs(file, flags);
    });
}
