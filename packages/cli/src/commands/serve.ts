import type { Command } from "commander";
import { runServerMain } from "@modsync/server";

export function registerServe(program: Command): void {
  program
    .command("serve")
    .description("start the ModSync web server (pass server options after the command)")
    .allowUnknownOption(true)
    .helpOption(false)
    .argument("[options...]", "--port <n> --host <addr> --token <t> --no-token --open --static <dir> --settings <path>")
    .action(async (options: string[]) => {
      const result = await runServerMain(options);
      if (!result) return;
      // Keep the process alive until the server is closed (SIGINT/SIGTERM handled in runServerMain).
      await new Promise<void>(() => undefined);
    });
}
