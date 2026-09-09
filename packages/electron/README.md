# @modsync/electron

Desktop shell for ModSync. The main process starts `@modsync/server` in-process on
`127.0.0.1:<random port>` with a random bearer token, then opens a `BrowserWindow`
on `http://127.0.0.1:<port>/?token=<token>` serving the built `@modsync/web` bundle.

Native features the web UI cannot provide are exposed two ways:

- `window.modsync` (preload, `contextIsolation` + `sandbox`): `isElectron`, `pickDirectory`,
  `pickFile`, `openExternal`, `getVersion`, `onFileLoaded`.
- The same `pickDirectory` / `pickFile` / `openExternal` functions are passed to the server as
  `electronBridge`, so the REST routes work identically.

`nxm://` links (Nexus Mods "Download with manager") are registered to this app and forwarded
to the server as `POST /api/downloads/nxm { url }`.

## Layout

| File | Purpose |
| --- | --- |
| `src/main.ts` | Main process (ESM): single-instance lock, server, window, menu, `nxm://` handling. |
| `src/preload.cts` | Preload (CommonJS, required for a sandboxed preload) exposing `window.modsync`. |
| `src/ipc.ts` | `ipcMain.handle` implementations (`dialog.showOpenDialog`, `shell.openExternal`); also the `electronBridge` object given to the server. |
| `src/bridge.ts` | Shared `ModSyncBridge` type and IPC channel names. |
| `src/global.d.ts` | Declares `window.modsync` for TypeScript consumers. |
| `src/server-shim.d.ts` | Temporary ambient typing for `@modsync/server`; delete once that package builds. |

`tsc` (NodeNext) emits `src/main.ts` -> `dist/main.js` (ESM) and `src/preload.cts` -> `dist/preload.cjs`.

## Running

No `electron-builder` / packaging step exists yet; the app runs from the built sources.

```sh
# from the repo root
pnpm --filter @modsync/web build       # produces packages/web/dist (served by the server)
pnpm --filter @modsync/server build    # produces packages/server/dist (imported by main.ts)
pnpm --filter @modsync/electron build  # produces packages/electron/dist
pnpm --filter @modsync/electron start  # electron dist/main.js
```

`pnpm --filter @modsync/electron dev` builds the electron package and starts it in one step.

The static bundle is resolved as `../../web/dist` relative to `packages/electron/dist`, so keep
the workspace layout intact. If the bundle is missing the app still starts (the server will
answer API requests) but prints a warning.

### Linux containers / running as root

Chromium refuses to start as root without disabling its sandbox:

```sh
pnpm --filter @modsync/electron exec electron --no-sandbox dist/main.js
```

A display (`DISPLAY` / Wayland) is still required; `xvfb-run` works for headless CI.

### Protocol handler in development

When launched through the `electron` binary (not a packaged app), `main.ts` registers
`nxm://` with the script path included (`electron <path>/dist/main.js`). On Linux this
requires a `.desktop` entry to be honoured by the desktop environment; on Windows and macOS
`app.setAsDefaultProtocolClient` is enough.
