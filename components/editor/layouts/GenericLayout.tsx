"use client";

import { Input } from "@/components/ui/Field";
import { TitleSlug } from "../parts/TitleSlug";
import { BodyEditor } from "../parts/BodyEditor";
import { DeleteLink } from "../parts/DeleteLink";
import { CoverImage } from "../CoverImage";
import { TypeFields } from "../TypeFields";
import { SeoPanel } from "../SeoPanel";
import { SchemaPanel } from "../SchemaPanel";
import type { EditorLayoutProps } from "./types";

/**
 * Article-centric layout (BLOG, NEWS): a wide rich-text body is the primary
 * surface, with cover/type-fields/SEO/schema in the right rail.
 */
export function GenericLayout({
  item,
  draft,
  update,
  gateErrors,
  contentId,
  initialSchema,
  onEditorReady,
  onDelete,
}: EditorLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <TitleSlug draft={draft} update={update} item={item} gateErrors={gateErrors} />
        <Input
          label="Excerpt"
          value={draft.excerpt}
          onChange={(e) => update({ excerpt: e.target.value })}
          placeholder="A short summary shown in listings."
        />
        <BodyEditor draft={draft} update={update} onReady={onEditorReady} label="Article" />
      </div>

      <aside className="space-y-4">
        <CoverImage
          coverAssetId={draft.coverAssetId}
          onChange={(id) => update({ coverAssetId: id })}
          error={gateErrors.coverAssetId}
        />
        <TypeFields
          type={item.type}
          typeData={draft.typeData}
          onChange={(patch) => update({ typeData: { ...draft.typeData, ...patch } })}
          fieldErrors={gateErrors}
        />
        <SeoPanel
          seo={draft.seo}
          slug={draft.slug}
          type={item.type}
          title={draft.title}
          onChange={(patch) => update({ seo: { ...draft.seo, ...patch } })}
          fieldErrors={gateErrors}
        />
        <SchemaPanel contentId={contentId} initialSchema={initialSchema} />
        <DeleteLink onDelete={onDelete} />
      </aside>
    </div>
  );
}
