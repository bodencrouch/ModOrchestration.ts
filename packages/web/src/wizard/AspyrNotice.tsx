import { Markdown } from "../components/Markdown";
import { actions, useAppState } from "../state/store";

export function AspyrNotice() {
  const s = useAppState();
  const platform = s.settings?.platform ?? "PC";
  return (
    <section className="page page-narrow">
      <Markdown source={s.file?.config.aspyrSectionContent ?? ""} hideLinks={s.spoilerFree} />
      <div className="card">
        <h3>Which version of the game do you have?</h3>
        {s.game && (
          <p className="muted">
            Detected: {s.game.game} {s.game.isAspyr ? "(Aspyr build)" : "(classic build)"}
          </p>
        )}
        <label className="radio">
          <input type="radio" name="platform" checked={platform === "PC"} onChange={() => actions.updateSettings({ platform: "PC" })} />
          Classic PC build (GOG / disc / Steam legacy)
        </label>
        <label className="radio">
          <input type="radio" name="platform" checked={platform === "Mobile"} onChange={() => actions.updateSettings({ platform: "Mobile" })} />
          Aspyr build (Steam update / mobile) — enables Aspyr-only mods
        </label>
      </div>
    </section>
  );
}
