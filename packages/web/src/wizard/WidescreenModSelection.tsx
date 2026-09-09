import { ModSelection } from "./ModSelection";
import { useAppState } from "../state/store";

export function WidescreenModSelection() {
  const s = useAppState();
  return (
    <>
      <div className="page-intro">
        <p className="muted">
          Select the widescreen mods to apply now that the base build is installed
          {s.install.baseSummary ? ` (${s.install.baseSummary.succeeded} base mods installed)` : ""}. Leave everything unchecked to skip this phase.
        </p>
      </div>
      <ModSelection phase="widescreen" />
    </>
  );
}
