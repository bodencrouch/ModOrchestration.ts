import type { ModSyncBridge } from "./bridge.js";

declare global {
  interface Window {
    /** Present only inside the Electron shell (see `preload.cts`). */
    modsync?: ModSyncBridge;
  }
}

export {};
