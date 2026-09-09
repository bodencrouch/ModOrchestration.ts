import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import { useAppState } from "../state/store";
import type { ArchiveListResult, BrowseResult } from "../types";
import { toPlaceholder } from "./util";

const ARCHIVE_RE = /\.(zip|7z|rar|exe)$/i;

export interface BrowseSourceProps {
  onInsert: (paths: string[]) => void;
  onClose: () => void;
}

/**
 * Lists `/api/fs/browse` starting at the mod directory, lets the user open
 * archives through `/api/archive/list?path=` and inserts placeholder paths
 * (`<<modDirectory>>/...`) for the chosen entries.
 */
export function BrowseSource({ onInsert, onClose }: BrowseSourceProps) {
  const s = useAppState();
  const dirs = { modDirectory: s.settings?.modDirectory ?? "", kotorDirectory: s.settings?.kotorDirectory ?? "" };
  const [listing, setListing] = useState<BrowseResult | null>(null);
  const [archive, setArchive] = useState<ArchiveListResult | null>(null);
  const [path, setPath] = useState(dirs.modDirectory || "/");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const browse = async (p: string) => {
    setLoading(true);
    setError(null);
    setArchive(null);
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

  const openArchive = async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.archiveList(p);
      setArchive(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void browse(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (p: string) => {
    const n = new Set(picked);
    if (n.has(p)) n.delete(p);
    else n.add(p);
    setPicked(n);
  };

  /** Placeholder path for an entry inside an archive: `<<modDirectory>>/<archive stem>/<entry>`. */
  const archiveEntryPath = (entry: string) => {
    if (!archive) return entry;
    const dir = archive.path.replace(/\\/g, "/").replace(/\/[^/]*$/, "");
    const stem = archive.path.replace(/\\/g, "/").replace(/^.*\//, "").replace(ARCHIVE_RE, "");
    const rel = entry.replace(/\/$/, "");
    const inner = rel.startsWith(`${stem}/`) || rel === stem ? rel : `${stem}/${rel}`;
    return `${toPlaceholder(dir, dirs)}/${inner}`;
  };

  return (
    <Modal
      title="Browse source"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="muted small grow">{picked.size} selected · paths are inserted with placeholders</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={picked.size === 0} onClick={() => onInsert([...picked])}>
            Insert
          </button>
        </>
      }
    >
      <div className="browser-toolbar">
        <button className="btn btn-sm" onClick={() => browse(dirs.modDirectory || "/")} disabled={!dirs.modDirectory}>
          Mod dir
        </button>
        <button className="btn btn-sm" onClick={() => browse(dirs.kotorDirectory || "/")} disabled={!dirs.kotorDirectory}>
          Game dir
        </button>
        <button className="btn btn-sm" disabled={!listing?.parent && !archive} onClick={() => (archive ? setArchive(null) : listing?.parent && browse(listing.parent))}>
          ↑ Up
        </button>
        <form
          className="grow row"
          onSubmit={(e) => {
            e.preventDefault();
            browse(path);
          }}
        >
          <input className="grow mono" value={path} onChange={(e) => setPath(e.target.value)} />
          <button className="btn btn-sm" type="submit">
            Go
          </button>
        </form>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading && <div className="muted">Loading…</div>}
      {!loading && archive && (
        <div className="browser-list">
          <div className="muted small mono">{archive.path}</div>
          {archive.entries.map((e) => {
            const ph = archiveEntryPath(e.path);
            return (
              <label key={e.path} className={`browser-entry ${picked.has(ph) ? "selected" : ""}`}>
                <input type="checkbox" checked={picked.has(ph)} onChange={() => toggle(ph)} />
                <span className="browser-icon">{e.isDirectory ? "📁" : "📄"}</span>
                <span className="grow">{e.path}</span>
                <span className="muted small mono">{ph}</span>
              </label>
            );
          })}
        </div>
      )}
      {!loading && !archive && listing && (
        <div className="browser-list">
          {listing.entries
            .slice()
            .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))
            .map((e) => {
              const ph = toPlaceholder(e.path, dirs);
              const isArchive = !e.isDirectory && ARCHIVE_RE.test(e.name);
              return (
                <div key={e.path} className={`browser-entry ${picked.has(ph) ? "selected" : ""}`}>
                  <input type="checkbox" checked={picked.has(ph)} onChange={() => toggle(ph)} onClick={(ev) => ev.stopPropagation()} />
                  <span className="browser-icon">{e.isDirectory ? "📁" : isArchive ? "🗜" : "📄"}</span>
                  <span className="grow" onClick={() => (e.isDirectory ? browse(e.path) : isArchive ? openArchive(e.path) : toggle(ph))}>
                    {e.name}
                  </span>
                  {isArchive && (
                    <button className="btn btn-sm" onClick={() => openArchive(e.path)}>
                      Open archive
                    </button>
                  )}
                  {e.isDirectory && (
                    <button className="btn btn-sm" onClick={() => toggle(`${ph}/*`)} title="Insert a wildcard for everything in this folder">
                      Add /*
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </Modal>
  );
}
