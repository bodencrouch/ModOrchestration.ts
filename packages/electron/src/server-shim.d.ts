// TEMPORARY ambient declaration for `@modsync/server`.
//
// The server package is implemented by a parallel agent; until its `dist/`
// exists TypeScript cannot resolve the workspace import, so this shim mirrors
// the agreed-upon public signature. DELETE THIS FILE once `@modsync/server`
// builds (the real `dist/index.d.ts` takes precedence over an ambient module
// declaration, but keeping both around invites drift).
declare module "@modsync/server" {
  export interface ElectronBridge {
    pickDirectory: (opts?: { title?: string; defaultPath?: string }) => Promise<string | undefined>;
    pickFile: (opts?: {
      title?: string;
      filters?: { name: string; extensions: string[] }[];
    }) => Promise<string | undefined>;
    openExternal: (url: string) => Promise<void>;
  }

  export interface ModSyncServerOptions {
    token?: string;
    staticDir?: string;
    settingsPath?: string;
    electronBridge?: ElectronBridge;
  }

  export interface ModSyncServer {
    /** Bind and resolve with the base URL, e.g. `http://127.0.0.1:51234`. */
    listen(port: number, host: string): Promise<string>;
    close(): Promise<void>;
  }

  export function createModSyncServer(opts: ModSyncServerOptions): Promise<ModSyncServer>;
}
