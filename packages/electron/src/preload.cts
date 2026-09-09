// Preload script. Compiled to CommonJS (`dist/preload.cjs`) because a
// sandboxed preload (`sandbox: true`) can only `require("electron")`; ESM is
// not available there.
import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  ModSyncBridge,
  PickDirectoryOptions,
  PickFileOptions,
} from "./bridge.js";

// Channel names are duplicated here rather than imported from `./bridge.js`:
// that module is ESM and a sandboxed preload cannot load workspace modules at
// runtime. Keep in sync with `IPC` in `src/bridge.ts`.
const CHANNELS = {
  pickDirectory: "modsync:pick-directory",
  pickFile: "modsync:pick-file",
  openExternal: "modsync:open-external",
  getVersion: "modsync:get-version",
  fileLoaded: "modsync:file-loaded",
} as const;

const bridge: ModSyncBridge = {
  isElectron: true,
  pickDirectory: (opts?: PickDirectoryOptions) =>
    ipcRenderer.invoke(CHANNELS.pickDirectory, opts) as Promise<string | undefined>,
  pickFile: (opts?: PickFileOptions) =>
    ipcRenderer.invoke(CHANNELS.pickFile, opts) as Promise<string | undefined>,
  openExternal: (url: string) =>
    ipcRenderer.invoke(CHANNELS.openExternal, url) as Promise<void>,
  getVersion: () => ipcRenderer.invoke(CHANNELS.getVersion) as Promise<string>,
  onFileLoaded: (callback: (path: string) => void) => {
    const listener = (_event: IpcRendererEvent, path: unknown) => {
      if (typeof path === "string") callback(path);
    };
    ipcRenderer.on(CHANNELS.fileLoaded, listener);
    return () => {
      ipcRenderer.removeListener(CHANNELS.fileLoaded, listener);
    };
  },
};

contextBridge.exposeInMainWorld("modsync", bridge);
