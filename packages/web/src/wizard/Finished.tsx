import { Markdown } from "../components/Markdown";
import { actions, setState, useAppState } from "../state/store";
import { goTo } from "./navigation";

export function Finished() {
  const s = useAppState();
  const base = s.install.baseSummary;
  const ws = s.install.widescreenSummary;
  return (
    <section className="page page-narrow">
      <h1>All done</h1>
      <div className="stats">
        {base && (
          <div className="stat">
            <span className="stat-label">Base mods</span>
            <span className="stat-value">{base.succeeded}</span>
            <span className="muted">installed · {base.failed} failed · {base.skipped} skipped</span>
          </div>
        )}
        {ws && (
          <div className="stat">
            <span className="stat-label">Widescreen mods</span>
            <span className="stat-value">{ws.succeeded}</span>
            <span className="muted">installed · {ws.failed} failed</span>
          </div>
        )}
      </div>
      {s.file?.config.afterModListContent && <Markdown source={s.file.config.afterModListContent} hideLinks={s.spoilerFree} />}
      <div className="row gap">
        <button
          className="btn btn-primary"
          onClick={() => {
            setState({ step: 0, report: null });
            goTo("Welcome");
          }}
        >
          Start over
        </button>
        <button className="btn" onClick={() => actions.setMode("editor")}>
          Open the editor
        </button>
      </div>
    </section>
  );
}
