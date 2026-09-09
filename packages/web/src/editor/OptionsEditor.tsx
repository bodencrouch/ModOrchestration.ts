import { useState } from "react";
import type { InstructionFile, ModComponent, ModOption } from "../types";
import { CheckField, GuidPicker, ReorderButtons, TextArea, TextField } from "./fields";
import { InstructionList } from "./InstructionForm";
import { blankOption, moveItem, newGuid } from "./util";

export function OptionsEditor({ mod, file, onChange }: { mod: ModComponent; file: InstructionFile; onChange: (options: ModOption[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const options = mod.options;
  const update = (o: ModOption) => onChange(options.map((x) => (x.guid === o.guid ? o : x)));
  return (
    <div className="options-editor">
      {options.map((o, i) => (
        <div key={o.guid} className={`instruction-item ${open === o.guid ? "open" : ""}`}>
          <div className="instruction-head" onClick={() => setOpen(open === o.guid ? null : o.guid)}>
            <span className="grow">
              <strong>{o.name || "(unnamed option)"}</strong>
              {o.exclusiveGroup && <span className="badge small">group: {o.exclusiveGroup}</span>}
              {o.isSelected && <span className="badge badge-ok small">default</span>}
              <span className="muted small"> · {o.instructions.length} instruction(s)</span>
            </span>
            <ReorderButtons index={i} length={options.length} onMove={(to) => onChange(moveItem(options, i, to))} onRemove={() => onChange(options.filter((_, j) => j !== i))} />
          </div>
          {open === o.guid && (
            <div className="option-form">
              <div className="grid-2">
                <TextField label="Name" value={o.name} onChange={(v) => update({ ...o, name: v })} />
                <div className="row">
                  <TextField label="GUID" value={o.guid} onChange={(v) => update({ ...o, guid: v })} mono />
                  <button className="btn btn-sm" style={{ alignSelf: "flex-end" }} onClick={() => update({ ...o, guid: newGuid() })}>
                    New GUID
                  </button>
                </div>
              </div>
              <TextArea label="Description" value={o.description} onChange={(v) => update({ ...o, description: v || undefined })} rows={2} />
              <TextArea label="Directions" value={o.directions} onChange={(v) => update({ ...o, directions: v || undefined })} rows={2} />
              <div className="grid-2">
                <TextField label="Exclusive group" value={o.exclusiveGroup} onChange={(v) => update({ ...o, exclusiveGroup: v || undefined })} hint="only one option per group" />
                <div className="field">
                  <label>Flags</label>
                  <CheckField label="Selected by default" value={o.isSelected} onChange={(v) => update({ ...o, isSelected: v })} />
                </div>
              </div>
              <div className="grid-2">
                <GuidPicker label="Dependencies" value={o.dependencies} onChange={(v) => update({ ...o, dependencies: v })} file={file} exclude={o.guid} />
                <GuidPicker label="Restrictions" value={o.restrictions} onChange={(v) => update({ ...o, restrictions: v })} file={file} exclude={o.guid} />
                <GuidPicker label="Install after" value={o.installAfter} onChange={(v) => update({ ...o, installAfter: v })} file={file} exclude={o.guid} />
                <GuidPicker label="Install before" value={o.installBefore} onChange={(v) => update({ ...o, installBefore: v })} file={file} exclude={o.guid} />
              </div>
              <h4>Instructions</h4>
              <InstructionList instructions={o.instructions} file={file} onChange={(list) => update({ ...o, instructions: list })} />
            </div>
          )}
        </div>
      ))}
      <button
        className="btn btn-sm"
        onClick={() => {
          const o = blankOption();
          onChange([...options, o]);
          setOpen(o.guid);
        }}
      >
        + Add option
      </button>
    </div>
  );
}
