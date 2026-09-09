#!/usr/bin/env node
/**
 * `modsync` command line: validate | install | dry-run | docs | import-md |
 * checkpoints | serve.
 */
import { Command } from "commander";
import { registerCheckpoints } from "./commands/checkpoints.js";
import { registerDocs } from "./commands/docs.js";
import { registerImportMd } from "./commands/importMd.js";
import { registerInstall } from "./commands/install.js";
import { registerServe } from "./commands/serve.js";
import { CliError } from "./commands/shared.js";
import { registerValidate } from "./commands/validate.js";

export const CLI_VERSION = "2.0.0";

export function buildProgram(): Command {
  const program = new Command("modsync")
    .description("ModSync: a multi-mod instruction builder and installer for KOTOR 1 and 2")
    .version(CLI_VERSION)
    .showHelpAfterError()
    .enablePositionalOptions();
  registerValidate(program);
  registerInstall(program);
  registerDocs(program);
  registerImportMd(program);
  registerCheckpoints(program);
  registerServe(program);
  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`error: ${err.message}`);
      process.exitCode = err.exitCode;
      return;
    }
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  }
}

void main();
