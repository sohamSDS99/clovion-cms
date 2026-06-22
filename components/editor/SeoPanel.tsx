"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Field";
import { cn } from "@/lib/ui/cn";
import {
  metaDescriptionStatus,
  metaTitleStatus,
} from "@/lib/ui/format";
import type { ContentType, SeoData } from "@/lib/ui/types";

/**
 * SEO side panel (FR-EDITOR-05): meta title + description with live char counts
 * (warn >60 / outside 50–160) and a Google-style SERP preview. Field errors
 * from the publish gate are surfaced inline.
 */
export function SeoPanel({
  seo,
  onChange,
  slug,
  type,
  title,
  fieldErrors,
}: {
  seo: SeoData;
  onChange: (patch: Partial<SeoData>) => void;
  slug: string;
  type: ContentType;
  title: string;
  fieldErrors?: Record<string, string>;
}) {
  const metaTitle = seo.metaTitle ?? "";
  const metaDescription = seo.metaDescription ?? "";
  const titleStat = metaTitleStatus(metaTitle);
  const descStat = metaDescriptionStatus(metaDescription);

  const previewTitle = metaTitle || title || "Untitled";
  const previewDesc =
    metaDescription ||
    "Add a meta description to control how this page appears in search results.";
  const previewUrl = `clovion.ai/${type.toLowerCase()}/${slug || "…"}`;

  return (
    <Card>
      <CardHeader title="SEO" subtitle="How this appears in search." />
      <div className="space-y-4 p-5">
        {/* SERP preview */}
        <div className="rounded-sm border border-line bg-paper p-3.5">
          <p className="truncate text-xs text-[#1f6b53]">{previewUrl}</p>
          <p className="mt-0.5 truncate text-[15px] font-medium text-[#1a0dab]">
            {previewTitle}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">
            {previewDesc}
          </p>
        </div>

        <Input
          label="Meta title"
          value={metaTitle}
          onChange={(e) => onChange({ metaTitle: e.target.value })}
          placeholder={title}
          error={fieldErrors?.["seo.metaTitle"]}
          hint={
            <span className={cn(counterTone(titleStat.state))}>
              {titleStat.count}/60
            </span>
          }
        />

        <Textarea
          label="Meta description"
          value={metaDescription}
          onChange={(e) => onChange({ metaDescription: e.target.value })}
          rows={3}
          placeholder="A concise summary for search engines (50–160 characters)."
          error={fieldErrors?.["seo.metaDescription"]}
          hint={
            <span className={cn(counterTone(descStat.state))}>
              {descStat.count} · 50–160
            </span>
          }
        />

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={Boolean(seo.noindex)}
            onChange={(e) => onChange({ noindex: e.target.checked })}
            className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent/25"
          />
          Hide from search engines (noindex)
        </label>
      </div>
    </Card>
  );
}

function counterTone(state: "ok" | "warn" | "empty"): string {
  if (state === "warn") return "text-warn font-medium";
  if (state === "ok") return "text-accent";
  return "text-ink-faint";
}
