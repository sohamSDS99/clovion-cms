"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { editorExtensions } from "@/lib/editor/config";
import { EditorToolbar } from "./EditorToolbar";
import type { TiptapDoc } from "@/lib/ui/types";

/**
 * The shared rich-text editor (FR-EDITOR-01). Renders the toolbar + the
 * ProseMirror surface, and reports document changes upward (debounced autosave
 * lives in the parent). Uses the canonical extension set from lib/editor/config.
 *
 * (We render a lightweight empty-state hint ourselves rather than pulling the
 * optional @tiptap/extension-placeholder package.)
 */
export function TiptapEditor({
  initialDoc,
  onChange,
}: {
  initialDoc: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
}) {
  const editor = useEditor({
    // Avoid SSR hydration mismatch warnings in Next App Router.
    immediatelyRender: false,
    extensions: editorExtensions,
    content: hasContent(initialDoc) ? (initialDoc as Record<string, unknown>) : "",
    editorProps: {
      attributes: {
        class: "tiptap",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Content body",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as TiptapDoc),
  });

  // Keep the editor in sync if the document is replaced externally (e.g. a
  // revision restore). Compare serialized JSON to avoid clobbering typing.
  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(initialDoc ?? {});
    const current = JSON.stringify(editor.getJSON());
    if (incoming !== current && hasContent(initialDoc)) {
      editor.commands.setContent(initialDoc as Record<string, unknown>, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, initialDoc]);

  const isEmpty = editor?.isEmpty ?? !hasContent(initialDoc);

  return (
    <div className="rounded border border-line bg-paper-raised shadow-card">
      <EditorToolbar editor={editor} />
      <div
        className="relative cursor-text px-5 py-4"
        onClick={() => editor?.chain().focus().run()}
      >
        {isEmpty ? (
          <p className="pointer-events-none absolute left-5 top-4 text-ink-faint">
            Start writing, or paste a YouTube link to embed a video…
          </p>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/** True when the doc has at least one non-empty node. */
function hasContent(doc: TiptapDoc | undefined | null): boolean {
  if (!doc || typeof doc !== "object") return false;
  const content = (doc as { content?: unknown[] }).content;
  return Array.isArray(content) && content.length > 0;
}
