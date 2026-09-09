import { Markdown } from "../components/Markdown";
import { useAppState } from "../state/store";

export function WidescreenNotice() {
  const s = useAppState();
  return (
    <section className="page page-narrow">
      <Markdown source={s.file?.config.widescreenSectionContent ?? ""} hideLinks={s.spoilerFree} />
      <div className="alert alert-warn">
        Widescreen mods modify the game executable and GUI files. ModSync only touches EXE files in this explicit, opt-in phase.
      </div>
    </section>
  );
}
