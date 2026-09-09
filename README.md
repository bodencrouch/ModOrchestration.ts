# ModSync

ModSync is a multi-mod instruction builder and installer for Knights of the Old
Republic 1 and 2. Think of TSLPatcher's ChangeEdit for `changes.ini`, but for
many mods at once, with a much simpler syntax, aimed at end users who want a
one-click install according to the modder's configuration.

This repository is a full TypeScript reimplementation of the original C#
[KOTORModSync](https://github.com/th3w1zard1/KOTORModSync), delivered as a
hybrid Electron desktop app and a local web server with the same UI.

ModSync is **not** the modbuild. Instruction files (TOML) live with the build
that describes them. The app only reads them.

## What it does

End-user loop:

1. Load an instruction file.
2. Check and uncheck the mods you want in the left list.
3. Pick your mod download directory and your KOTOR directory.
4. Press Install All.

Everything else (dependencies, restrictions, install order, options, folder
choices, TSLPatcher runs, CleanList conflict removal, checkpoints) is handled by
the installer. The developer editor creates and maintains instruction files and
generates the human-readable markdown guides from them.

## Repository layout

| package | purpose |
|---|---|
| `packages/core` | Domain model, TOML and markdown serialization, path sandbox, virtual filesystem dry run, archive adapters (zip, rar, 7z, 7z SFX), actions, installer, checkpoints, downloads, widescreen, settings, logging |
| `packages/kotor-formats` | GFF, 2DA, TLK, SSF, ERF/MOD/RIM readers and writers and a native TSLPatcher-compatible `changes.ini` engine |
| `packages/server` | Fastify REST + WebSocket server that drives core and serves the web UI |
| `packages/web` | React wizard UI, developer editor, dependency graph view |
| `packages/electron` | Desktop shell hosting the server in-process |
| `packages/cli` | `modsync` command line: validate, dry-run, install, docs, import-md, checkpoints, serve |
| `instructions/` | Example instruction file |
| `docs/` | Plan, architecture notes, format references |

## Getting started

```bash
pnpm install
pnpm build
# Web mode (browser on localhost)
pnpm modsync serve --open
# Desktop mode
pnpm --filter @modsync/electron start
# CLI
pnpm modsync validate instructions/example_kotor1.toml --mods ~/kotor-mods --kotor ~/kotor
pnpm modsync install  instructions/example_kotor1.toml --mods ~/kotor-mods --kotor ~/kotor
pnpm modsync docs     instructions/example_kotor1.toml --style deadlystream -o full.md
pnpm modsync import-md full.md -o build.toml
```

Run the tests with `pnpm test`.

## Design principles carried over from the original

- Every mod and every instruction has a GUID. Uniqueness inside a file is guaranteed by the GUID, not by the name.
- Paths in instruction files use `<<modDirectory>>` and `<<kotorDirectory>>`. The sandbox refuses to touch anything outside those two roots.
- Validation is a dry run through a virtual filesystem, including looking inside archives, before anything is written.
- Instructions are never merged into clever combined steps. Each one runs and logs separately so a failure points at one step.
- No hardcoded mod names in the installer. CleanList reads the community CSV instead of a batch file.
- No EXE or DLL edits except the explicit, opt-in widescreen module.
- The patcher engine fails closed on malformed `changes.ini`, like HoloPatcher.
- End users do not edit TOML. The editor is a separate mode for build authors.

See `docs/PLAN.md` for the module contract and `docs/ARCHITECTURE.md` for how
the pieces fit together.
