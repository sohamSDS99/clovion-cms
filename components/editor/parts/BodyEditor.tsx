"use client";

import type { Editor } from "@tiptap/react";
import { TiptapEditor } from "../TiptapEditor";
import type { Draft } from "../layouts/types";

/**
 * The single rich-text body editor (the AI Write target). Layouts give it a
 * type-appropriate label — "Article" for blog, "Description" for a webinar,
 * "Overview" for a resource, etc. Exactly one of these must be rendered per
 * layout (it carries onEditorReady for AI insert + selection).
 */
export function BodyEditor({
  draft,
  update,
  onReady,
  label,
  hint,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onReady: (editor: Editor | null) => void;
  label?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <label className="text-[13px] font-medium text-ink-soft">{label}</label>
      ) : null}
      {hint ? <p className="text-xs text-ink-mute">{hint}</p> : null}
      <TiptapEditor
        initialDoc={draft.body}
        onChange={(body) => update({ body })}
        onReady={onReady}
      />
    </div>
  );
}
