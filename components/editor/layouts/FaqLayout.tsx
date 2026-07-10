"use client";

import { TitleSlug } from "../parts/TitleSlug";
import { BodyEditor } from "../parts/BodyEditor";
import { DeleteLink } from "../parts/DeleteLink";
import { FaqQuestions } from "../parts/FaqQuestions";
import { CoverImage } from "../CoverImage";
import { SeoPanel } from "../SeoPanel";
import { SchemaPanel } from "../SchemaPanel";
import type { FaqItem } from "@/lib/ui/types";
import type { EditorLayoutProps } from "./types";

/**
 * FAQ-centric layout. An FAQ article's PRIMARY content is a list of Q&A pairs —
 * not a prose body. So the main column is a first-class repeatable Q&A editor
 * (FaqQuestions), with the rich-text BodyEditor demoted to a compact optional
 * lead-in (it stays mounted as the single AI Write insertion target). SEO
 * (FAQPage schema), schema markup, optional cover, and delete live in the rail.
 */
export function FaqLayout({
  item,
  draft,
  update,
  gateErrors,
  contentId,
  initialSchema,
  onEditorReady,
  onDelete,
}: EditorLayoutProps) {
  const faqItems: FaqItem[] = Array.isArray(draft.typeData.faqItems)
    ? (draft.typeData.faqItems as FaqItem[])
    : [];

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-8">
        <div className="space-y-4">
          <TitleSlug draft={draft} update={update} item={item} gateErrors={gateErrors} />
          <BodyEditor
            draft={draft}
            update={update}
            onReady={onEditorReady}
            label="Intro (optional)"
            hint="A short lead-in shown above the questions. Also the AI Write target."
          />
        </div>

        <FaqQuestions
          items={faqItems}
          onChange={(next) =>
            update({ typeData: { ...draft.typeData, faqItems: next } })
          }
          error={gateErrors["typeData.faqItems"]}
        />
      </div>

      <aside className="space-y-4">
        <SeoPanel
          seo={draft.seo}
          slug={draft.slug}
          type={item.type}
          title={draft.title}
          onChange={(patch) => update({ seo: { ...draft.seo, ...patch } })}
          fieldErrors={gateErrors}
        />
        <SchemaPanel contentId={contentId} initialSchema={initialSchema} />
        <CoverImage
          coverAssetId={draft.coverAssetId}
          onChange={(id) => update({ coverAssetId: id })}
          error={gateErrors.coverAssetId}
        />
        <DeleteLink onDelete={onDelete} />
      </aside>
    </div>
  );
}
