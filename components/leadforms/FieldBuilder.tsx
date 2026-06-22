"use client";

import { Button } from "@/components/ui/Button";
import { Input, Select, FieldShell } from "@/components/ui/Field";
import {
  FIELD_TYPE_OPTIONS,
  type LeadField,
  type LeadFieldType,
} from "./types";

/**
 * Editor for a lead form's ordered `fields[]`: add, remove, reorder (up/down),
 * and edit each field's label/type/required/options. Controlled — the parent
 * owns the array. Accessible: every control is labelled and reorder buttons
 * carry aria-labels.
 */
export function FieldBuilder({
  fields,
  onChange,
}: {
  fields: LeadField[];
  onChange: (next: LeadField[]) => void;
}) {
  function update(index: number, patch: Partial<LeadField>) {
    const next = fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange(next);
  }

  function changeType(index: number, type: LeadFieldType) {
    const patch: Partial<LeadField> = { type };
    // Keep `options` only for select fields.
    if (type === "select") {
      patch.options = fields[index].options?.length
        ? fields[index].options
        : [""];
    } else {
      patch.options = undefined;
    }
    update(index, patch);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function add() {
    const n = fields.length + 1;
    onChange([
      ...fields,
      { name: `field_${n}`, label: `Field ${n}`, type: "text", required: false },
    ]);
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 ? (
        <p className="rounded-sm border border-dashed border-line-strong bg-paper-sunken/40 px-3 py-4 text-center text-sm text-ink-mute">
          No fields yet. Add the questions this form should capture. An email is
          always collected automatically.
        </p>
      ) : null}

      {fields.map((field, i) => (
        <div
          key={i}
          className="rounded-sm border border-line bg-paper-raised p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-mute">
              Field {i + 1}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Move field ${i + 1} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Move field ${i + 1} down`}
                disabled={i === fields.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                aria-label={`Remove field ${i + 1}`}
                onClick={() => remove(i)}
              >
                Remove
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Label"
              value={field.label}
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <Input
              label="Field key"
              hint="machine name"
              value={field.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <Select
              label="Type"
              value={field.type}
              onChange={(e) => changeType(i, e.target.value as LeadFieldType)}
            >
              {FIELD_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <FieldShell label="Required">
              <label className="flex h-10 items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={field.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                Must be filled in
              </label>
            </FieldShell>
          </div>

          {field.type === "select" ? (
            <OptionsEditor
              options={field.options ?? [""]}
              onChange={(opts) => update(i, { options: opts })}
            />
          ) : null}
        </div>
      ))}

      <div>
        <Button type="button" variant="secondary" size="sm" onClick={add}>
          + Add field
        </Button>
      </div>
    </div>
  );
}

/** Editor for a select field's dropdown options. */
function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <FieldShell label="Dropdown options" className="mt-3">
      <div className="flex flex-col gap-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label={`Option ${i + 1}`}
              value={opt}
              onChange={(e) =>
                onChange(options.map((o, j) => (j === i ? e.target.value : o)))
              }
              className="h-9 w-full rounded-sm border border-line-strong bg-paper-raised px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Remove option ${i + 1}`}
              disabled={options.length <= 1}
              onClick={() => onChange(options.filter((_, j) => j !== i))}
            >
              ×
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange([...options, ""])}
          >
            + Add option
          </Button>
        </div>
      </div>
    </FieldShell>
  );
}
