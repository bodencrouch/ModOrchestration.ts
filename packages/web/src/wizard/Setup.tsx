import { useEffect, useRef, useState } from "react";
import { DirectoryBrowser } from "../components/DirectoryBrowser";
import { actions, useAppState } from "../state/store";

type BrowseTarget = "modDirectory" | "kotorDirectory" | "file" | null;

export function Setup() {
  const s = useAppState();
  const settings = s.settings;
  const [modDir, setModDir] = useState(settings?.modDirectory ?? "");
  const [kotorDir, setKotorDir] = useState(settings?.kotorDirectory ?? "");
  const [filePath, setFilePath] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [browse, setBrowse] = useState<BrowseTarget>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setModDir(settings.modDirectory);
      setKotorDir(settings.kotorDirectory);
    }
  }, [settings?.modDirectory, settings?.kotorDirectory]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitDir = (key: "modDirectory" | "kotorDirectory", value: string) => {
    if (settings && settings[key] !== value) void actions.updateSettings({ [key]: value });
  };

  const pick = async (target: Exclude<BrowseTarget, null>) => {
    if (target === "file") {
      if (window.modsync?.pickFile) {
        const p = await window.modsync.pickFile([{ name: "Instruction files", extensions: ["toml", "md"] }]);
        if (p) {
          setFilePath(p);
          void load({ path: p });
        }
        return;
      }
    } else if (window.modsync?.pickDirectory) {
      const p = await window.modsync.pickDirectory();
      if (p) {
        if (target === "modDirectory") setModDir(p);
        else setKotorDir(p);
        commitDir(target, p);
      }
      return;
    }
    setBrowse(target);
  };

  const load = async (body: { path: string } | { content: string } | { url: string }) => {
    setBusy(true);
    await actions.loadFile(body);
    setBusy(false);
  };

  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    const content = await f.text();
    setFilePath(f.name);
    await load({ content });
  };

  const game = s.game;

  return (
    <section className="page page-narrow">
      <h1>Setup</h1>

      <div className="card">
        <h3>1. Instruction file</h3>
        <p className="muted">A ModSync instruction file (TOML) describes every mod in the build. Load it from disk, upload it, or fetch it from a URL.</p>
        <div className="field">
          <label>Path on this computer</label>
          <div className="row">
            <input className="grow mono" value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="/path/to/build.toml" />
            <button className="btn" onClick={() => pick("file")}>
              Browse
            </button>
            <button className="btn btn-primary" disabled={!filePath || busy} onClick={() => load({ path: filePath })}>
              Load
            </button>
          </div>
        </div>
        <div className="field">
          <label>Upload</label>
          <div className="row">
            <input ref={fileInput} type="file" accept=".toml,.md,.txt" onChange={(e) => onUpload(e.target.files?.[0])} />
          </div>
        </div>
        <div className="field">
          <label>URL</label>
          <div className="row">
            <input className="grow mono" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…/build.toml" />
            <button className="btn btn-primary" disabled={!fileUrl || busy} onClick={() => load({ url: fileUrl })}>
              Fetch
            </button>
          </div>
        </div>
        {s.file && (
          <div className="alert alert-success">
            Loaded <strong>{s.file.config.name ?? "instruction file"}</strong> ({s.file.mods.length} mods, target {s.file.config.targetGame})
            {s.fileSource && <span className="muted"> from {s.fileSource}</span>}
          </div>
        )}
      </div>

      <div className="card">
        <h3>2. Directories</h3>
        <div className="field">
          <label>Mod directory (where downloaded archives live)</label>
          <div className="row">
            <input
              className="grow mono"
              value={modDir}
              onChange={(e) => setModDir(e.target.value)}
              onBlur={() => commitDir("modDirectory", modDir)}
              placeholder="/home/you/kotor-mods"
            />
            <button className="btn" onClick={() => pick("modDirectory")}>
              Browse
            </button>
          </div>
        </div>
        <div className="field">
          <label>KOTOR game directory</label>
          <div className="row">
            <input
              className="grow mono"
              value={kotorDir}
              onChange={(e) => setKotorDir(e.target.value)}
              onBlur={() => commitDir("kotorDirectory", kotorDir)}
              placeholder="C:\\Program Files (x86)\\Steam\\steamapps\\common\\swkotor"
            />
            <button className="btn" onClick={() => pick("kotorDirectory")}>
              Browse
            </button>
          </div>
        </div>
        {game && settings?.kotorDirectory && (
          <div className={`alert ${game.game === "Unknown" ? "alert-warn" : "alert-success"}`}>
            {game.game === "Unknown" ? (
              <>No game executable found in that folder. Make sure it contains swkotor.exe / swkotor2.exe.</>
            ) : (
              <>
                Detected <strong>{game.game}</strong>
                {game.isAspyr ? " (Aspyr build)" : ""}
                {game.executable && <span className="muted mono"> · {game.executable}</span>}
                {s.file && s.file.config.targetGame !== "Unknown" && s.file.config.targetGame !== game.game && (
                  <div className="alert alert-error" style={{ marginTop: 8 }}>
                    This instruction file targets {s.file.config.targetGame}, but the folder contains {game.game}.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3>3. Options</h3>
        <div className="grid-2">
          <div className="field">
            <label>Patcher engine</label>
            <select value={settings?.patcherEngine ?? "Native"} onChange={(e) => actions.updateSettings({ patcherEngine: e.target.value as "Native" })}>
              <option value="Native">Native (built-in TSLPatcher engine)</option>
              <option value="HoloPatcher">HoloPatcher (external)</option>
              <option value="TSLPatcher">TSLPatcher.exe (external, wine on Linux/macOS)</option>
            </select>
          </div>
          <div className="field">
            <label>Compatibility level</label>
            <select
              value={settings?.compatibilityLevel ?? "Compatible"}
              onChange={(e) => actions.updateSettings({ compatibilityLevel: e.target.value as "Compatible" })}
            >
              <option value="Compatible">Compatible only</option>
              <option value="Untested">Allow untested combinations</option>
              <option value="Incompatible">Anything goes (not recommended)</option>
            </select>
          </div>
          <label className="check">
            <input type="checkbox" checked={settings?.createCheckpoints ?? true} onChange={(e) => actions.updateSettings({ createCheckpoints: e.target.checked })} />
            Create checkpoints after every instruction (lets you undo)
          </label>
          <label className="check">
            <input type="checkbox" checked={settings?.verboseLogging ?? false} onChange={(e) => actions.updateSettings({ verboseLogging: e.target.checked })} />
            Verbose logging
          </label>
        </div>
      </div>

      {browse && (
        <DirectoryBrowser
          title={browse === "file" ? "Choose an instruction file" : browse === "modDirectory" ? "Choose the mod directory" : "Choose the game directory"}
          initialPath={browse === "modDirectory" ? modDir : browse === "kotorDirectory" ? kotorDir : modDir || kotorDir}
          pickFiles={browse === "file"}
          extensions={browse === "file" ? [".toml", ".md"] : undefined}
          onClose={() => setBrowse(null)}
          onPick={(p) => {
            const target = browse;
            setBrowse(null);
            if (target === "file") {
              setFilePath(p);
              void load({ path: p });
            } else if (target === "modDirectory") {
              setModDir(p);
              commitDir("modDirectory", p);
            } else if (target === "kotorDirectory") {
              setKotorDir(p);
              commitDir("kotorDirectory", p);
            }
          }}
        />
      )}
    </section>
  );
}
