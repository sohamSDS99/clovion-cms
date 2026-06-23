import type { Editor } from "@tiptap/react";
import type { ContentItem, SeoData, TiptapDoc } from "@/lib/ui/types";

/** Editable slice of the content item kept in the editor's local state. */
export interface Draft {
  title: string;
  slug: string;
  slugTouched: boolean;
  excerpt: string;
  body: TiptapDoc;
  seo: SeoData;
  typeData: Record<string, unknown>;
  coverAssetId: string | null;
}

/**
 * Contract every per-type editor layout receives from the ContentEditor
 * orchestrator. Layouts only arrange UI + call `update(patch)`; the orchestrator
 * owns autosave, lifecycle, the single Tiptap instance (via onEditorReady), and
 * AI insertion. Layouts MUST render exactly one <BodyEditor onReady={onEditorReady}/>
 * (the AI Write target) so selection/insertion keep working.
 */
export interface EditorLayoutProps {
  item: ContentItem;
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  gateErrors: Record<string, string>;
  contentId: string;
  /** Persisted schema-markup for the SchemaPanel. */
  initialSchema: unknown;
  /** Lifts the body Tiptap instance for AI insert + selection tracking. */
  onEditorReady: (editor: Editor | null) => void;
  onDelete: () => void;
}
