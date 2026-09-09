import { useAppState } from "../state/store";
import { api } from "../api/client";

export function Welcome() {
  const s = useAppState();
  const cfg = s.file?.config;
  return (
    <section className="page page-narrow">
      <h1>Welcome to ModSync</h1>
      <p className="lead">
        ModSync installs a curated list of mods for <strong>Knights of the Old Republic</strong> I and II in the right
        order, with the right options, and keeps checkpoints so you can undo any step.
      </p>
      {cfg ? (
        <div className="card">
          <h3>{cfg.name ?? "Instruction file loaded"}</h3>
          <dl className="kv">
            <dt>Game</dt>
            <dd>{cfg.targetGame}</dd>
            {cfg.version && (
              <>
                <dt>Version</dt>
                <dd>{cfg.version}</dd>
              </>
            )}
            {cfg.author && (
              <>
                <dt>Author</dt>
                <dd>{cfg.author}</dd>
              </>
            )}
            <dt>Mods</dt>
            <dd>{s.file?.mods.length}</dd>
          </dl>
          {cfg.description && !s.spoilerFree && <p>{cfg.description}</p>}
        </div>
      ) : (
        <div className="card">
          <p>No instruction file is loaded yet. You will pick one on the Setup page.</p>
        </div>
      )}
      <h3>How it works</h3>
      <ol className="steps">
        <li>Read the build notes and choose your game and mod folders.</li>
        <li>Tick the mods you want; ModSync resolves dependencies and order.</li>
        <li>Download the archives, run a dry-run validation, then install.</li>
        <li>Optionally apply widescreen mods as a second phase.</li>
      </ol>
      {api.isMock && <div className="alert alert-info">Mock mode is active: no server is needed, everything is simulated in the browser.</div>}
    </section>
  );
}
