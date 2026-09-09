import { actions, modName, setState, useAppState } from "../state/store";
import type { DownloadItem } from "../types";

export function formatBytes(n: number | undefined): string {
  if (n === undefined) return "?";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function statusLabel(d: DownloadItem): string {
  switch (d.status) {
    case "queued":
      return "Queued";
    case "downloading":
      return `${formatBytes(d.receivedBytes)} / ${formatBytes(d.totalBytes)}${d.bytesPerSecond ? ` · ${formatBytes(d.bytesPerSecond)}/s` : ""}`;
    case "finished":
      return "Done";
    case "failed":
      return `Failed: ${d.error ?? "unknown error"}`;
    case "needs-browser":
      return `Manual download needed${d.reason ? `: ${d.reason}` : ""}`;
  }
}

export function DownloadsDrawer() {
  const s = useAppState();
  if (!s.showDownloads) return null;
  const list = s.downloads;
  const done = list.filter((d) => d.status === "finished").length;
  return (
    <aside className="drawer">
      <div className="drawer-header">
        <h3>Downloads</h3>
        <span className="muted">
          {done}/{list.length} complete
        </span>
        <button className="btn btn-sm" onClick={() => actions.startDownloads()} disabled={!s.file}>
          Start all
        </button>
        <button className="btn btn-icon" onClick={() => setState({ showDownloads: false })} aria-label="Close downloads">
          ×
        </button>
      </div>
      <div className="drawer-body">
        {list.length === 0 && <p className="muted">No downloads yet. Press "Start all" to download every selected mod that has a direct link.</p>}
        {list.map((d) => {
          const pct = d.totalBytes ? Math.round((d.receivedBytes / d.totalBytes) * 100) : d.status === "finished" ? 100 : 0;
          return (
            <div key={d.id} className={`download status-${d.status}`}>
              <div className="download-title">
                <strong>{modName(s, d.modGuid)}</strong>
                <span className="muted ellipsis">{d.fileName ?? d.url}</span>
              </div>
              <div className="progress">
                <div className="progress-bar" style={{ width: `${pct}%` }} />
              </div>
              <div className="download-status">
                <span>{statusLabel(d)}</span>
                {(d.status === "needs-browser" || d.status === "failed") && (
                  <button className="btn btn-sm" onClick={() => actions.openExternal(d.url)}>
                    Open in browser
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
