import { Markdown } from "../components/Markdown";
import { useAppState } from "../state/store";

export function BeforeContent() {
  const s = useAppState();
  return (
    <section className="page page-narrow">
      <Markdown source={s.file?.config.beforeModListContent ?? ""} hideLinks={s.spoilerFree} />
    </section>
  );
}
