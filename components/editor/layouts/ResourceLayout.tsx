"use client";

import { TitleSlug } from "../parts/TitleSlug";
import { BodyEditor } from "../parts/BodyEditor";
import { DeleteLink } from "../parts/DeleteLink";
import { ResourceFile } from "../parts/ResourceFile";
import { CoverImage } from "../CoverImage";
import { SeoPanel } from "../SeoPanel";
import { SchemaPanel } from "../SchemaPanel";
import { Input } from "@/components/ui/Field";
import type { EditorLayoutProps } from "./types";

/**
 * Resource layout: a downloadable resource's primary content is the FILE and
 * how it's gated — so the "Resource file" card is the hero (PDF upload, kind,
 * gating + lead form). The Overview body is a secondary landing-page blurb.
 * Cover/SEO/schema live in the right rail.
 */
export function ResourceLayout({
  item,
  draft,
  update,
  gateErrors,
  contentId,
  initialSchema,
  onEditorReady,
  onDelete,
}: EditorLayoutProps) {
  const patchTypeData = (patch: Record<string, unknown>) =>
    update({ typeData: { ...draft.typeData, ...patch } });

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <TitleSlug draft={draft} update={update} item={item} gateErrors={gateErrors} />

        {/* HERO: the deliverable + gating — the whole point of the page. */}
        <ResourceFile
          typeData={draft.typeData}
          onChange={patchTypeData}
          fieldErrors={gateErrors}
        />

        {/* Secondary: landing-page copy describing the resource. */}
        <div className="space-y-4">
          <Input
            label="Excerpt"
            hint="optional"
            value={draft.excerpt}
            onChange={(e) => update({ excerpt: e.target.value })}
            placeholder="One-line teaser shown in resource listings."
          />
          <BodyEditor
            draft={draft}
            update={update}
            onReady={onEditorReady}
            label="Overview"
            hint="What's inside and why it's worth downloading. Shown on the landing page."
          />
        </div>
      </div>

      <aside className="space-y-4">
        <CoverImage
          coverAssetId={draft.coverAssetId}
          onChange={(id) => update({ coverAssetId: id })}
          error={gateErrors.coverAssetId}
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
