"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api, errorMessage } from "@/lib/ui/client";
import { FaqQuestions } from "./FaqQuestions";
import type { FaqItem, ContentType } from "@/lib/ui/types";

/**
 * The embeddable FAQ section surface used by every content type. Wraps the
 * repeatable Q&A editor (FaqQuestions) and adds a "Generate with AI" action that
 * drafts questions from the article via POST /api/content/[id]/faq/generate.
 *
 * Generated items are APPENDED to the current list — draft-only and fully
 * editable. Nothing here publishes; the parent persists via the normal PATCH.
 */
export function FaqSection({
  contentId,
  contentType,
  items,
  onChange,
  error,
  title,
  emptyTitle,
  emptyBody,
}: {
  contentId: string;
  contentType: ContentType;
  items: FaqItem[];
  onChange: (next: FaqItem[]) => void;
  error?: string;
  title?: string;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await api.post<{ faqItems: FaqItem[] }>(
        `/api/content/${contentId}/faq/generate`,
        {}
      );
      onChange([...items, ...(res.faqItems ?? [])]);
    } catch (err) {
      setGenError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  const generateButton = (
    <Button
      variant="secondary"
      size="sm"
      onClick={generate}
      loading={generating}
      disabled={generating}
      title={`Draft FAQ questions from this ${contentType.toLowerCase()} with AI (editable draft)`}
    >
      {generating ? "Generating…" : "Generate with AI"}
    </Button>
  );

  return (
    <div className="space-y-2">
      <FaqQuestions
        items={items}
        onChange={onChange}
        error={error}
        title={title}
        emptyTitle={emptyTitle}
        emptyBody={emptyBody}
        action={generateButton}
      />
      {genError ? (
        <p
          role="alert"
          className="rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          {genError}
        </p>
      ) : null}
    </div>
  );
}
