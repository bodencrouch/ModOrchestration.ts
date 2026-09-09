import type { InstructionFile, ModComponent } from "../types";
import { CATEGORIES, INSTALLATION_METHODS, INSTALL_STATES, TIERS } from "../types";
import { CheckField, Field, GuidPicker, ListField, SelectField, TextArea, TextField } from "./fields";
import { InstructionList } from "./InstructionForm";
import { OptionsEditor } from "./OptionsEditor";
import { newGuid } from "./util";

export function ModForm({ mod, file, onChange }: { mod: ModComponent; file: InstructionFile; onChange: (m: ModComponent) => void }) {
  const set = <K extends keyof ModComponent>(k: K, v: ModComponent[K]) => onChange({ ...mod, [k]: v });
  const hashesText = Object.entries(mod.expectedHashes ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  return (
    <div className="mod-form">
      <div className="grid-2">
        <TextField label="Name" value={mod.name} onChange={(v) => set("name", v)} />
        <div className="row">
          <TextField label="GUID" value={mod.guid} onChange={(v) => set("guid", v)} mono />
          <button className="btn btn-sm" style={{ alignSelf: "flex-end" }} onClick={() => set("guid", newGuid())} title="Generate a new GUID">
            New GUID
          </button>
        </div>
      </div>
      <TextArea label="Description" value={mod.description} onChange={(v) => set("description", v || undefined)} rows={3} />
      <TextArea label="Directions" value={mod.directions} onChange={(v) => set("directions", v || undefined)} rows={3} hint="markdown shown before install" />
      <TextArea label="Usage warnings" value={mod.usageWarnings} onChange={(v) => set("usageWarnings", v || undefined)} rows={2} />
      <div className="grid-2">
        <ListField label="Authors" value={mod.authors} onChange={(v) => set("authors", v)} mode="commas" />
        <TextField label="Language" value={mod.language} onChange={(v) => set("language", v || undefined)} hint='e.g. "YES", "NO", "PARTIAL - ..."' />
        <ListField label="Mod links" value={mod.modLink} onChange={(v) => set("modLink", v)} mono />
        <ListField label="Expected files" value={mod.expectedFiles} onChange={(v) => set("expectedFiles", v.length ? v : undefined)} mono hint="archive names in the mod directory, wildcards ok" />
        <ListField label="Images" value={mod.images} onChange={(v) => set("images", v.length ? v : undefined)} mono hint="URLs for the install slideshow" />
        <Field label="Expected hashes" hint="filename=sha1, one per line">
          <textarea
            className="mono"
            rows={2}
            key={hashesText}
            defaultValue={hashesText}
            onBlur={(e) => {
              const out: Record<string, string> = {};
              for (const line of e.target.value.split(/\r?\n/)) {
                const m = /^\s*([^=]+?)\s*=\s*([0-9a-fA-F]+)\s*$/.exec(line);
                if (m) out[m[1]] = m[2].toLowerCase();
              }
              set("expectedHashes", Object.keys(out).length ? out : undefined);
            }}
          />
        </Field>
      </div>
      <div className="grid-3">
        <SelectField label="Tier" value={mod.tier} options={TIERS} onChange={(v) => v && set("tier", v)} />
        <SelectField label="Installation method" value={mod.installationMethod} options={INSTALLATION_METHODS} onChange={(v) => v && set("installationMethod", v)} />
        <SelectField label="Install state" value={mod.installState} options={INSTALL_STATES} onChange={(v) => v && set("installState", v)} />
        <Field label="Heading level" hint="2 or 3 in the source markdown">
          <input type="number" min={1} max={6} value={mod.headingLevel ?? ""} onChange={(e) => set("headingLevel", e.target.value ? Number(e.target.value) : undefined)} />
        </Field>
      </div>
      <Field label="Categories">
        <div className="check-grid">
          {CATEGORIES.map((c) => (
            <CheckField key={c} label={c} value={mod.category.includes(c)} onChange={(on) => set("category", on ? [...mod.category, c] : mod.category.filter((x) => x !== c))} />
          ))}
        </div>
      </Field>
      <Field label="Flags">
        <div className="check-grid">
          <CheckField label="Selected by default" value={mod.isSelected} onChange={(v) => set("isSelected", v)} />
          <CheckField label="Downloaded" value={mod.isDownloaded} onChange={(v) => set("isDownloaded", v)} />
          <CheckField label="Full build only" value={mod.fullBuildOnly} onChange={(v) => set("fullBuildOnly", v)} hint="excluded from spoiler-free builds" />
          <CheckField label="Widescreen mod" value={mod.isWidescreen} onChange={(v) => set("isWidescreen", v)} hint="installed in the widescreen phase" />
          <CheckField label="Aspyr only" value={mod.aspyrOnly} onChange={(v) => set("aspyrOnly", v)} />
          <CheckField label="Is a patch" value={mod.isPatch} onChange={(v) => set("isPatch", v)} />
        </div>
      </Field>
      <div className="grid-2">
        <GuidPicker label="Dependencies" value={mod.dependencies} onChange={(v) => set("dependencies", v)} file={file} exclude={mod.guid} />
        <GuidPicker label="Restrictions" value={mod.restrictions} onChange={(v) => set("restrictions", v)} file={file} exclude={mod.guid} />
        <GuidPicker label="Install after" value={mod.installAfter} onChange={(v) => set("installAfter", v)} file={file} exclude={mod.guid} />
        <GuidPicker label="Install before" value={mod.installBefore} onChange={(v) => set("installBefore", v)} file={file} exclude={mod.guid} />
        <GuidPicker label="Untested with" value={mod.untestedWith} onChange={(v) => set("untestedWith", v)} file={file} exclude={mod.guid} />
      </div>
      <h3>Instructions</h3>
      <InstructionList instructions={mod.instructions} file={file} onChange={(list) => set("instructions", list)} />
      <h3>Options</h3>
      <OptionsEditor mod={mod} file={file} onChange={(o) => set("options", o)} />
    </div>
  );
}
