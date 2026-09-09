/**
 * Shape of the API the preload script exposes to the renderer as
 * `window.modsync`. Shared between `preload.cts`, `ipc.ts` and `global.d.ts`
 * so the three cannot drift apart.
 */
export interface PickDirectoryOptions {
  title?: string;
  defaultPath?: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface PickFileOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

export interface ModSyncBridge {
  /** Always `true` when running inside the Electron shell. */
  readonly isElectron: true;
  /** Native "choose folder" dialog; resolves `undefined` when cancelled. */
  pickDirectory(opts?: PickDirectoryOptions): Promise<string | undefined>;
  /** Native "choose file" dialog; resolves `undefined` when cancelled. */
  pickFile(opts?: PickFileOptions): Promise<string | undefined>;
  /** Open an `http(s)://` URL in the user's default browser. */
  openExternal(url: string): Promise<void>;
  /** Version of the Electron shell (`app.getVersion()`). */
  getVersion(): Promise<string>;
  /**
   * Subscribe to "File > Open instruction file..." from the native menu. The
   * main process has already POSTed the path to `/api/file/load`; the callback
   * lets the UI refresh. Returns an unsubscribe function.
   */
  onFileLoaded(callback: (path: string) => void): () => void;
}

/** IPC channel names shared by `preload.cts` and `ipc.ts`. */
export const IPC = {
  pickDirectory: "modsync:pick-directory",
  pickFile: "modsync:pick-file",
  openExternal: "modsync:open-external",
  getVersion: "modsync:get-version",
  fileLoaded: "modsync:file-loaded",
} as const;
