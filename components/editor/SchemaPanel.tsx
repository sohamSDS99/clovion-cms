"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import { validateJsonLd, schemaTypes, formatJsonLd } from "@/lib/editor/schema";

/**
 * Schema-markup panel (FR-EDITOR-06). Advanced editor side panel:
 *  - "Regenerate from content" -> POST /api/content/{id}/schema, which derives
 *    JSON-LD from the current content (generateJsonLd per type),
 *  - a JSON editor (textarea) with LIVE validation; invalid JSON disables ONLY
 *    this panel's Save (it never blocks the rest of the editor / autosave),
 *  - Save persists the JSON-LD via PATCH /api/content/{id} { schemaMarkup },
 *  - displays which @type(s) the JSON-LD declares.
 *
 * The textarea holds raw text so users can hand-edit; we validate on every
 * keystroke and surface the parse error inline.
 */
export function SchemaPanel({
  contentId,
  initialSchema,
}: {
  contentId: string;
  /** Existing schemaMarkup from the item (object/array) or null. */
  initialSchema: unknown;
}) {
  const toast = useToast();
  const [text, setText] = useState<string>(() =>
    initialSchema ? formatJsonLd(initialSchema) : ""
  );
  const [dirty, setDirty] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const validation = useMemo(() => validateJsonLd(text), [text]);
  const types = useMemo(
    () => (validation.valid ? schemaTypes(validation.value) : []),
    [validation]
  );

  async function regenerate() {
    setRegenerating(true);
    try {
      // The endpoint returns the freshly generated JSON-LD. Accept a couple of
      // shapes defensively: { schemaMarkup } | { jsonLd } | the doc itself.
      const res = await api.post<Record<string, unknown>>(
        `/api/content/${contentId}/schema`
      );
      const generated =
        (res?.schemaMarkup as unknown) ??
        (res?.jsonLd as unknown) ??
        (res?.schema as unknown) ??
        res;
      setText(formatJsonLd(generated));
      setDirty(true);
      toast.success("Schema regenerated from content.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRegenerating(false);
    }
  }

  async function save() {
    if (!validation.valid) return;
    setSaving(true);
    try {
      await api.patch(`/api/content/${contentId}`, {
        schemaMarkup: validation.value,
        source: "manual",
      });
      setDirty(false);
      toast.success("Schema saved.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Schema markup"
        subtitle="JSON-LD structured data for search."
        action={
          types.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-1">
              {types.slice(0, 3).map((t) => (
                <Badge key={t} tone="accent">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null
        }
      />
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={regenerate}
            loading={regenerating}
          >
            Regenerate from content
          </Button>
          <span
            className={
              validation.valid
                ? "text-[11px] text-accent"
                : "text-[11px] text-danger"
            }
          >
            {text.trim() === ""
              ? "Empty"
              : validation.valid
                ? "Valid JSON"
                : "Invalid JSON"}
          </span>
        </div>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
          spellCheck={false}
          rows={12}
          aria-label="JSON-LD schema markup"
          aria-invalid={validation.valid ? undefined : true}
          placeholder='{ "@context": "https://schema.org", "@type": "Article", … }'
          className={[
            "w-full resize-y rounded-sm border bg-paper px-3 py-2 font-mono text-xs leading-relaxed text-ink",
            "focus:outline-none focus:ring-2",
            validation.valid
              ? "border-line-strong focus:border-accent focus:ring-accent/25"
              : "border-danger focus:border-danger focus:ring-danger/25",
          ].join(" ")}
        />

        {!validation.valid && validation.error ? (
          <p className="text-xs text-danger" role="alert">
            {validation.error}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={save}
            disabled={!validation.valid || !dirty}
            loading={saving}
          >
            Save schema
          </Button>
          {!validation.valid ? (
            <span className="text-[11px] text-ink-faint">
              Fix the JSON to enable saving (this won&rsquo;t block other edits).
            </span>
          ) : dirty ? (
            <span className="text-[11px] text-ink-mute">Unsaved schema changes</span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
