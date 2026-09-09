import type { MainConfig } from "../types";
import { COMPATIBILITY_LEVELS, PATCHER_ENGINES, PLATFORMS, TARGET_GAMES } from "../types";
import { CheckField, SelectField, TextArea, TextField } from "./fields";

export function ConfigForm({ config, onChange }: { config: MainConfig; onChange: (c: MainConfig) => void }) {
  const set = <K extends keyof MainConfig>(k: K, v: MainConfig[K]) => onChange({ ...config, [k]: v });
  return (
    <div className="mod-form">
      <div className="grid-2">
        <TextField label="Build name" value={config.name} onChange={(v) => set("name", v || undefined)} />
        <TextField label="Version" value={config.version} onChange={(v) => set("version", v || undefined)} />
        <TextField label="Author" value={config.author} onChange={(v) => set("author", v || undefined)} />
        <TextField label="Source URL" value={config.sourceUrl} onChange={(v) => set("sourceUrl", v || undefined)} mono hint="where the markdown came from (for merge)" />
        <SelectField label="Target game" value={config.targetGame} options={TARGET_GAMES} onChange={(v) => v && set("targetGame", v)} />
        <SelectField label="Compatibility level" value={config.compatibilityLevel} options={COMPATIBILITY_LEVELS} onChange={(v) => v && set("compatibilityLevel", v)} />
        <SelectField label="Patcher engine" value={config.patcherEngine} options={PATCHER_ENGINES} onChange={(v) => v && set("patcherEngine", v)} />
        <SelectField label="Platform" value={config.platform} options={PLATFORMS} onChange={(v) => v && set("platform", v)} />
      </div>
      <CheckField label="Spoiler-free build by default" value={config.spoilerFree} onChange={(v) => set("spoilerFree", v)} />
      <TextArea label="Description" value={config.description} onChange={(v) => set("description", v || undefined)} rows={2} />
      <TextArea label="Before mod list (markdown)" value={config.beforeModListContent} onChange={(v) => set("beforeModListContent", v || undefined)} rows={8} mono />
      <TextArea label="Aspyr section (markdown, KOTOR2)" value={config.aspyrSectionContent} onChange={(v) => set("aspyrSectionContent", v || undefined)} rows={5} mono />
      <TextArea label="Widescreen section (markdown)" value={config.widescreenSectionContent} onChange={(v) => set("widescreenSectionContent", v || undefined)} rows={5} mono />
      <TextArea label="After mod list (markdown)" value={config.afterModListContent} onChange={(v) => set("afterModListContent", v || undefined)} rows={5} mono />
    </div>
  );
}
