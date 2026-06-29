"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Loading, InlineError } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/ui/client";
import { formatDateTime } from "@/lib/ui/format";

interface WritingStyleResponse {
  body: string;
  updatedAt: string | null;
}

const PLACEHOLDER = `Write in a confident, plain-spoken voice for a B2B marketing audience.

• Lead with the reader's problem, then the payoff.
• Short paragraphs, scannable subheadings, concrete examples over adjectives.
• No hype, no filler, no em-dash overuse. Cite claims grounded in the Knowledge Base.
• Prefer active voice. UK/US spelling: US.`;

/**
 * Settings → Writing Style tab. A single master prompt the AI follows for
 * EVERY content type when generating drafts. Backed by the always-active
 * master WritingSOP via /api/settings/writing-style.
 */
export function WritingStyle({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<WritingStyleResponse>("/api/settings/writing-style")
      .then((r) => {
        setBody(r.body);
        setUpdatedAt(r.updatedAt);
        setLoaded(true);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.put<WritingStyleResponse>(
        "/api/settings/writing-style",
        { body: body.trim() }
      );
      setUpdatedAt(r.updatedAt);
      toast.success("Writing style saved.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (error) return <InlineError message={error} />;
  if (!loaded) return <Loading label="Loading writing style…" />;

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl">
      <Card className="overflow-hidden">
        <div className="border-b border-line px-6 py-5">
          <h3 className="text-lg font-semibold text-ink">Master writing prompt</h3>
          <p className="mt-0.5 text-sm text-ink-mute">
            The AI follows these guidelines whenever it drafts content — across
            blogs, news, resources and FAQs.
          </p>
        </div>

        <div className="px-6 py-6">
          <Textarea
            aria-label="Master writing prompt"
            rows={16}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={PLACEHOLDER}
            disabled={!canEdit}
            className="font-mono text-[13px] leading-relaxed"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <p className="text-xs text-ink-mute">
            {updatedAt
              ? `Last updated ${formatDateTime(updatedAt)}`
              : "Not set yet"}
          </p>
          {canEdit ? (
            <Button variant="primary" type="submit" loading={saving}>
              Save changes
            </Button>
          ) : (
            <span className="text-xs text-ink-mute">Read-only</span>
          )}
        </div>
      </Card>
    </form>
  );
}
