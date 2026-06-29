"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
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
 *
 * Optionally lifts the live Editor instance up via `onReady` so sibling panels
 * (e.g. the AI Write panel) can read the current selection and insert content
 * through ProseMirror commands. The editor stays the single source of truth.
 */
export function TiptapEditor({
  initialDoc,
  onChange,
  onReady,
  fill = false,
  placeholder = "Start writing, or paste a YouTube link to embed a video…",
}: {
  initialDoc: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
  onReady?: (editor: Editor | null) => void;
  /** Fill the parent's height with an internally-scrolling body (no own border). */
  fill?: boolean;
  placeholder?: string;
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

  // Expose the editor instance upward once it is created (and clear on unmount).
  useEffect(() => {
    onReady?.(editor ?? null);
    return () => onReady?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

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

  if (fill) {
    // Borderless, fills the parent column; ONLY the body scrolls.
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-line">
          <EditorToolbar editor={editor} />
        </div>
        <div
          className="relative min-h-0 flex-1 cursor-text overflow-y-auto px-6 py-4"
          onClick={() => editor?.chain().focus().run()}
        >
          {isEmpty ? (
            <p className="pointer-events-none absolute left-6 top-4 text-ink-faint">
              {placeholder}
            </p>
          ) : null}
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-line bg-paper-raised shadow-card">
      <EditorToolbar editor={editor} />
      <div
        className="relative cursor-text px-5 py-4"
        onClick={() => editor?.chain().focus().run()}
      >
        {isEmpty ? (
          <p className="pointer-events-none absolute left-5 top-4 text-ink-faint">
            {placeholder}
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
