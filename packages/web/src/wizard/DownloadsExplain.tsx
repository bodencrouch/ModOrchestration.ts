import { actions, effectiveSelectedMods, setState, useAppState } from "../state/store";

export function DownloadsExplain() {
  const s = useAppState();
  const mods = effectiveSelectedMods(s, "base");
  const withLinks = mods.filter((m) => m.modLink.length > 0);
  const finished = s.downloads.filter((d) => d.status === "finished").length;
  const manual = s.downloads.filter((d) => d.status === "needs-browser" || d.status === "failed");
  return (
    <section className="page page-narrow">
      <h1>Downloads</h1>
      <p className="lead">
        Every mod archive has to be in your mod directory (<span className="mono">{s.settings?.modDirectory || "not set"}</span>) before installing.
      </p>
      <div className="card">
        <p>
          ModSync can download archives with a direct link automatically. Sites such as Nexus Mods (without an API key) and DeadlyStream require
          you to download in a browser: those mods will be listed as <em>Manual download needed</em> in the downloads drawer with a button that opens
          the page for you. Save the file into the mod directory and ModSync will pick it up during validation.
        </p>
        <ul>
          <li>{mods.length} mods selected, {withLinks.length} with download links</li>
          <li>
            {s.downloads.length} downloads tracked, {finished} finished{manual.length ? `, ${manual.length} need attention` : ""}
          </li>
        </ul>
        <div className="row gap">
          <button className="btn btn-primary" onClick={() => actions.startDownloads()} disabled={mods.length === 0}>
            Start downloads
          </button>
          <button className="btn" onClick={() => setState({ showDownloads: true })}>
            Show downloads
          </button>
        </div>
      </div>
      {!s.spoilerFree && (
        <div className="card">
          <h3>Links</h3>
          <ul className="link-list">
            {withLinks.map((m) => (
              <li key={m.guid}>
                <strong>{m.name}</strong>
                {m.modLink.map((l) => (
                  <a key={l} href={l} target="_blank" rel="noreferrer noopener" onClick={(e) => { e.preventDefault(); void actions.openExternal(l); }}>
                    {l}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted">You can continue while downloads run; validation on the next page checks which archives are still missing.</p>
    </section>
  );
}
