import type { SeoData, TiptapDoc } from "@/lib/ui/types";

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
  /** Category name (connect-or-create on save); "" = uncategorized. */
  category: string;
  /** Comma-separated tag names. */
  tags: string;
  /** Byline author profile id. */
  authorProfileId: string | null;
}
