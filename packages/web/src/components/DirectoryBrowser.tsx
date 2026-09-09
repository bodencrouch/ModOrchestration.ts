import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { BrowseResult } from "../types";
import { Modal } from "./Modal";

export interface DirectoryBrowserProps {
  title?: string;
  initialPath?: string;
  /** When true, files are selectable too (returns a file path). */
  pickFiles?: boolean;
  /** Only show files with these extensions (lowercase, with dot). */
  extensions?: string[];
  onPick: (path: string) => void;
  onClose: () => void;
}

/** Modal directory/file browser built on `/api/fs/roots` and `/api/fs/browse`. */
export function DirectoryBrowser({ title, initialPath, pickFiles, extensions, onPick, onClose }: DirectoryBrowserProps) {
  const [roots, setRoots] = useState<string[]>([]);
  const [listing, setListing] = useState<BrowseResult | null>(null);
  const [path, setPath] = useState(initialPath ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const browse = async (p: string) => {
    setLoading(true);
    setError(null);
    setSelectedFile(null);
    try {
      const res = await api.fsBrowse(p);
      setListing(res);
      setPath(res.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.fsRoots();
        if (cancelled) return;
        setRoots(r.roots);
        await browse(initialPath || r.roots[0] || "/");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = (listing?.entries ?? [])
    .filter((e) => e.isDirectory || (pickFiles && (!extensions || extensions.some((x) => e.name.toLowerCase().endsWith(x)))))
    .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));

  return (
    <Modal
      title={title ?? (pickFiles ? "Choose a file" : "Choose a directory")}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted mono grow ellipsis" title={selectedFile ?? path}>
            {selectedFile ?? path}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!listing || (pickFiles && !selectedFile)}
            onClick={() => onPick(selectedFile ?? path)}
          >
            {pickFiles ? "Select file" : "Select this folder"}
          </button>
        </>
      }
    >
      <div className="browser-toolbar">
        <select value="" onChange={(e) => e.target.value && browse(e.target.value)} aria-label="Roots">
          <option value="">Roots…</option>
          {roots.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button className="btn" disabled={!listing?.parent} onClick={() => listing?.parent && browse(listing.parent)}>
          ↑ Up
        </button>
        <form
          className="grow row"
          onSubmit={(e) => {
            e.preventDefault();
            browse(path);
          }}
        >
          <input className="grow mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="Type a path and press Enter" />
          <button className="btn" type="submit">
            Go
          </button>
        </form>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="browser-list">
        {loading && <div className="muted">Loading…</div>}
        {!loading && entries.length === 0 && <div className="muted">Empty folder</div>}
        {entries.map((e) => (
          <div
            key={e.path}
            className={`browser-entry ${selectedFile === e.path ? "selected" : ""}`}
            onClick={() => (e.isDirectory ? browse(e.path) : setSelectedFile(e.path))}
            onDoubleClick={() => !e.isDirectory && onPick(e.path)}
          >
            <span className="browser-icon">{e.isDirectory ? "📁" : "📄"}</span>
            <span>{e.name}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Use the Electron picker when present, else open the in-app browser. */
export async function pickDirectoryNative(): Promise<string | undefined | null> {
  if (window.modsync?.pickDirectory) return window.modsync.pickDirectory();
  return null; // caller falls back to DirectoryBrowser
}
