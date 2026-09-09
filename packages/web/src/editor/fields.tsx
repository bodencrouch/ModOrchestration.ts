import type { ReactNode } from "react";
import type { Guid, InstructionFile } from "../types";
import { guidChoices, splitCommas, splitLines } from "./util";

export function Field({ label, hint, children, inline }: { label: string; hint?: string; children: ReactNode; inline?: boolean }) {
  return (
    <div className={`field ${inline ? "field-inline" : ""}`}>
      <label>
        {label}
        {hint && <span className="muted small"> — {hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function TextField({ label, value, onChange, hint, mono, placeholder }: { label: string; value: string | undefined; onChange: (v: string) => void; hint?: string; mono?: boolean; placeholder?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input className={mono ? "mono" : ""} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function TextArea({ label, value, onChange, hint, rows = 4, mono }: { label: string; value: string | undefined; onChange: (v: string) => void; hint?: string; rows?: number; mono?: boolean }) {
  return (
    <Field label={label} hint={hint}>
      <textarea className={mono ? "mono" : ""} rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

/** A list of strings edited as one-per-line (or comma separated) text. */
export function ListField({ label, value, onChange, hint, mode = "lines", mono }: { label: string; value: string[] | undefined; onChange: (v: string[]) => void; hint?: string; mode?: "lines" | "commas"; mono?: boolean }) {
  const text = (value ?? []).join(mode === "lines" ? "\n" : ", ");
  return (
    <Field label={label} hint={hint ?? (mode === "lines" ? "one per line" : "comma separated")}>
      {mode === "lines" ? (
        <textarea className={mono ? "mono" : ""} rows={Math.max(2, Math.min(6, (value?.length ?? 0) + 1))} defaultValue={text} key={text} onBlur={(e) => onChange(splitLines(e.target.value))} />
      ) : (
        <input className={mono ? "mono" : ""} defaultValue={text} key={text} onBlur={(e) => onChange(splitCommas(e.target.value))} />
      )}
    </Field>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, hint, allowEmpty }: { label: string; value: T | undefined; options: readonly T[]; onChange: (v: T | undefined) => void; hint?: string; allowEmpty?: boolean }) {
  return (
    <Field label={label} hint={hint}>
      <select value={value ?? ""} onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}>
        {allowEmpty && <option value="">(none)</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckField({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="check" title={hint}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

/** Multi-select picker of mods/options by name that stores GUIDs. */
export function GuidPicker({ label, value, onChange, file, exclude, hint }: { label: string; value: Guid[]; onChange: (v: Guid[]) => void; file: InstructionFile; exclude?: Guid; hint?: string }) {
  const choices = guidChoices(file, exclude);
  const labelOf = (g: Guid) => choices.find((c) => c.guid === g)?.label ?? g;
  return (
    <Field label={label} hint={hint}>
      <div className="badge-row">
        {value.map((g) => (
          <span key={g} className="badge badge-btn" title={g}>
            {labelOf(g)}
            <button className="badge-x" onClick={() => onChange(value.filter((x) => x !== g))} aria-label={`Remove ${labelOf(g)}`}>
              ×
            </button>
          </span>
        ))}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value && !value.includes(e.target.value)) onChange([...value, e.target.value]);
          }}
        >
          <option value="">+ add…</option>
          {choices
            .filter((c) => !value.includes(c.guid))
            .map((c) => (
              <option key={c.guid} value={c.guid}>
                {c.isOption ? "  ↳ " : ""}
                {c.label}
              </option>
            ))}
        </select>
      </div>
    </Field>
  );
}

export function ReorderButtons({ index, length, onMove, onRemove }: { index: number; length: number; onMove: (to: number) => void; onRemove: () => void }) {
  return (
    <span className="reorder">
      <button className="btn btn-icon btn-sm" disabled={index === 0} onClick={() => onMove(index - 1)} title="Move up">
        ↑
      </button>
      <button className="btn btn-icon btn-sm" disabled={index >= length - 1} onClick={() => onMove(index + 1)} title="Move down">
        ↓
      </button>
      <button className="btn btn-icon btn-sm btn-danger" onClick={onRemove} title="Remove">
        ×
      </button>
    </span>
  );
}
