import type { Editor, JSONContent } from "@tiptap/react";
import type { AiMode } from "@/lib/editor/ai";
import type { TiptapDoc } from "@/lib/ui/types";

/**
 * Apply an AI-generated Tiptap doc to the LIVE editor via ProseMirror commands
 * (FR-EDITOR-08 insert step). This runs only on explicit user confirmation.
 *
 *  - rewrite  : replace the current selection with the generated content.
 *  - section  : insert at the document end without clobbering existing content.
 *  - full_draft / outline:
 *      - "replace": replace the whole document,
 *      - "append" : insert generated nodes at the end.
 *
 * Returns the resulting document JSON so the parent can sync its draft state and
 * trigger the AI-tagged PATCH.
 */
export function applyAiInsert(
  editor: Editor,
  mode: AiMode,
  strategy: "append" | "replace",
  generated: TiptapDoc
): TiptapDoc {
  const nodes = ((generated as { content?: JSONContent[] }).content ??
    []) as JSONContent[];

  if (mode === "rewrite") {
    // Replace the active selection (or insert at cursor if collapsed).
    editor.chain().focus().insertContent(nodes).run();
  } else if (mode === "section") {
    // Append after current content, then place caret at the end.
    const end = editor.state.doc.content.size;
    editor.chain().focus().insertContentAt(end, nodes).run();
  } else if (strategy === "replace") {
    editor
      .chain()
      .focus()
      .setContent(generated as JSONContent, true)
      .run();
  } else {
    const end = editor.state.doc.content.size;
    editor.chain().focus().insertContentAt(end, nodes).run();
  }

  return editor.getJSON() as TiptapDoc;
}
