import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { PickDirectoryOptions, PickFileOptions } from "./bridge.js";
import { IPC } from "./bridge.js";

/** Only `http:`/`https:` (and `mailto:`) may leave the app via the OS. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
  } catch {
    return false;
  }
}

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

async function showOpen(
  options: Electron.OpenDialogOptions,
): Promise<string | undefined> {
  const win = parentWindow();
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled) return undefined;
  return result.filePaths[0];
}

export async function pickDirectory(opts?: PickDirectoryOptions): Promise<string | undefined> {
  return showOpen({
    title: opts?.title ?? "Choose a folder",
    defaultPath: opts?.defaultPath,
    properties: ["openDirectory", "createDirectory"],
  });
}

export async function pickFile(opts?: PickFileOptions): Promise<string | undefined> {
  return showOpen({
    title: opts?.title ?? "Choose a file",
    defaultPath: opts?.defaultPath,
    filters: opts?.filters,
    properties: ["openFile"],
  });
}

export async function openExternal(url: string): Promise<void> {
  if (!isSafeExternalUrl(url)) {
    throw new Error(`Refusing to open non-http(s) URL: ${url}`);
  }
  await shell.openExternal(url);
}

/**
 * The same three functions are handed to `createModSyncServer` as
 * `electronBridge`, so the web UI can reach native dialogs either through the
 * preload IPC (`window.modsync`) or through the REST routes.
 */
export const electronBridge = { pickDirectory, pickFile, openExternal };

let registered = false;

/** Wire the `ipcMain.handle` channels backing `window.modsync`. Idempotent. */
export function registerIpcHandlers(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle(IPC.pickDirectory, (_event, opts?: PickDirectoryOptions) => pickDirectory(opts));
  ipcMain.handle(IPC.pickFile, (_event, opts?: PickFileOptions) => pickFile(opts));
  ipcMain.handle(IPC.openExternal, (_event, url: unknown) => {
    if (typeof url !== "string") throw new Error("openExternal expects a string URL");
    return openExternal(url);
  });
  ipcMain.handle(IPC.getVersion, () => app.getVersion());
}
