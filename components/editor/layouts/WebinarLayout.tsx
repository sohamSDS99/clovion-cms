"use client";

import { Input } from "@/components/ui/Field";
import { TitleSlug } from "../parts/TitleSlug";
import { BodyEditor } from "../parts/BodyEditor";
import { DeleteLink } from "../parts/DeleteLink";
import { WebinarDetails } from "../parts/WebinarDetails";
import { CoverImage } from "../CoverImage";
import { SeoPanel } from "../SeoPanel";
import { SchemaPanel } from "../SchemaPanel";
import type { EditorLayoutProps } from "./types";

/**
 * Webinar layout — an event / landing page, not a long article.
 *
 * Reading order foregrounds the EVENT: a wide banner (the cover doubles as the
 * event hero image) and title sit up top; the prominent "Event details" card is
 * the first thing in the main column (scheduling, registration CTA, speakers,
 * live-vs-recorded state). The rich-text body is demoted to a secondary
 * "Description" beneath it, with a one-line summary above it. SEO (Event
 * schema) + JSON-LD + delete live in the right rail.
 */
export function WebinarLayout({
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
    <div className="space-y-6 p-6">
      {/* Banner hero — cover acts as the event banner. */}
      <CoverImage
        coverAssetId={draft.coverAssetId}
        onChange={(id) => update({ coverAssetId: id })}
        error={gateErrors.coverAssetId}
      />

      <TitleSlug draft={draft} update={update} item={item} gateErrors={gateErrors} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* The event is the primary content. */}
          <WebinarDetails draft={draft} update={update} gateErrors={gateErrors} />

          {/* Description is secondary: a one-line summary + the abstract/agenda body. */}
          <div className="space-y-4">
            <Input
              label="Summary"
              hint="one line, used in listings"
              value={draft.excerpt}
              onChange={(e) => update({ excerpt: e.target.value })}
              placeholder="A short summary of what attendees will learn."
            />
            <BodyEditor
              draft={draft}
              update={update}
              onReady={onEditorReady}
              label="Description"
              hint="Abstract, agenda, and what attendees will take away."
            />
          </div>
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
          <DeleteLink onDelete={onDelete} />
        </aside>
      </div>
    </div>
  );
}
