"use client";

import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Label, FieldShell } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { InlineError } from "@/components/ui/Feedback";
import { api } from "@/lib/ui/client";
import { contentTypeLabel } from "@/lib/ui/format";
import {
  type AiBrief,
  type AiMode,
  type SseDone,
  aiErrorMessage,
  isRetryable,
  defaultStrategy,
} from "@/lib/editor/ai";
import { useAiGeneration, type GenerateArgs } from "./useAiGeneration";
import type { ContentType, WritingSop } from "@/lib/ui/types";

export type InsertStrategy = "append" | "replace";

/** What the panel hands back to the editor when the user clicks Insert. */
export interface AiInsertPayload {
  mode: AiMode;
  strategy: InsertStrategy;
  result: SseDone;
}

const MODES: { value: AiMode; label: string; blurb: string }[] = [
  { value: "full_draft", label: "Full draft", blurb: "Generate a complete draft from a brief." },
  { value: "section", label: "Write section", blurb: "Draft a single named section." },
  { value: "rewrite", label: "Rewrite selection", blurb: "Reword the text selected in the editor." },
  { value: "outline", label: "Outline", blurb: "Produce a structured heading outline." },
];

/**
 * In-editor AI Write panel (FR-EDITOR-08, §6.1). Slide-over drawer with:
 *  - a brief form (topic, keywords, outline, length; section name / selection
 *    depending on mode), content type prefilled from the item,
 *  - optional KB tag scope + the active SOP name for this type,
 *  - a Generate action that streams tokens into a PREVIEW (never the live doc),
 *  - a Stop (abort) control while streaming,
 *  - explicit Insert (Append/Replace) and Discard actions on completion.
 *
 * The panel NEVER mutates the document; the parent performs the merge + PATCH.
 */
export function AiWritePanel({
  open,
  onClose,
  contentId,
  contentType,
  hasSelection,
  selectedText,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  contentId: string;
  contentType: ContentType;
  /** Whether the editor currently has a non-empty text selection. */
  hasSelection: boolean;
  /** The currently-selected editor text (for rewrite mode). */
  selectedText: string;
  onInsert: (payload: AiInsertPayload) => Promise<void> | void;
}) {
  const gen = useAiGeneration();

  const [mode, setMode] = useState<AiMode>("full_draft");
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [outline, setOutline] = useState("");
  const [lengthTarget, setLengthTarget] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [kbTags, setKbTags] = useState("");
  const [strategy, setStrategy] = useState<InsertStrategy>("replace");
  const [inserting, setInserting] = useState(false);

  const [activeSop, setActiveSop] = useState<WritingSop | null>(null);
  const [sopLoaded, setSopLoaded] = useState(false);

  // Reset transient run state whenever the drawer is (re)opened.
  useEffect(() => {
    if (open) gen.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the default insert strategy aligned with the chosen mode.
  useEffect(() => {
    setStrategy(defaultStrategy(mode));
  }, [mode]);

  // Fetch the active SOP for this content type (read-only display).
  useEffect(() => {
    if (!open || sopLoaded) return;
    let active = true;
    api
      .get<{ sops: WritingSop[] }>("/api/sop", {
        appliesTo: contentType,
        activeOnly: true,
      })
      .then((r) => {
        if (!active) return;
        setActiveSop(r.sops?.[0] ?? null);
        setSopLoaded(true);
      })
      .catch(() => active && setSopLoaded(true));
    return () => {
      active = false;
    };
  }, [open, sopLoaded, contentType]);

  const busy = gen.status === "streaming";
  const canInsert = gen.status === "done" && gen.result !== null;

  const briefValid = useMemo(() => {
    if (mode === "rewrite") return hasSelection && selectedText.trim().length > 0;
    if (mode === "section") return sectionName.trim().length > 0 || topic.trim().length > 0;
    return topic.trim().length > 0;
  }, [mode, topic, sectionName, hasSelection, selectedText]);

  function buildArgs(): GenerateArgs {
    const brief: AiBrief = {
      topic: topic.trim() || undefined,
      keywords: keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      outline: outline.trim() || undefined,
      lengthTarget: lengthTarget.trim() || undefined,
    };
    if (mode === "section") brief.sectionName = sectionName.trim() || undefined;
    if (mode === "rewrite") brief.selectedText = selectedText;
    if (brief.keywords && brief.keywords.length === 0) delete brief.keywords;

    return {
      contentId,
      contentType,
      mode,
      brief,
      kbTags: kbTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
  }

  function runGenerate() {
    void gen.generate(buildArgs());
  }

  async function handleInsert() {
    if (!gen.result) return;
    setInserting(true);
    try {
      await onInsert({ mode, strategy, result: gen.result });
      onClose();
    } finally {
      setInserting(false);
    }
  }

  function handleDiscard() {
    gen.reset();
  }

  // Streaming/preview text: live tokens while streaming, final html when done.
  const previewText = gen.status === "done" ? gen.result?.html ?? "" : gen.partialText;

  return (
    <Drawer open={open} onClose={onClose} title="AI Write" width="max-w-xl">
      <div className="space-y-5">
        <p className="text-xs text-ink-mute">
          Drafts are generated into a preview below. Nothing is added to your
          document until you choose <strong>Insert</strong>. AI output is always a
          draft &mdash; it never publishes on its own.
        </p>

        {/* Mode selector */}
        <fieldset>
          <Label>Mode</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {MODES.map((m) => {
              const selected = mode === m.value;
              const disabled = m.value === "rewrite" && !hasSelection;
              return (
                <button
                  key={m.value}
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => setMode(m.value)}
                  aria-pressed={selected}
                  title={disabled ? "Select text in the editor first" : m.blurb}
                  className={[
                    "rounded-sm border px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "border-accent bg-accent-soft text-accent-ink"
                      : "border-line-strong bg-paper-raised text-ink hover:bg-paper-sunken",
                    disabled || busy ? "cursor-not-allowed opacity-50" : "",
                  ].join(" ")}
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-mute">
                    {m.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Content type (read-only) + active SOP */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-mute">
          <span>Content type:</span>
          <Badge tone="neutral">{contentTypeLabel(contentType)}</Badge>
          <span className="mx-1 text-ink-faint">•</span>
          <span>SOP:</span>
          {!sopLoaded ? (
            <span className="text-ink-faint">checking…</span>
          ) : activeSop ? (
            <Badge tone="accent" className="max-w-[14rem] truncate">
              {activeSop.name}
            </Badge>
          ) : (
            <span className="text-ink-faint">active SOP applied</span>
          )}
        </div>

        {/* Brief form */}
        <div className="space-y-3">
          {mode === "rewrite" ? (
            <FieldShell
              label="Selected text"
              hint={`${selectedText.trim().length} chars`}
              error={
                !hasSelection
                  ? "Select some text in the editor to rewrite."
                  : undefined
              }
            >
              <div className="max-h-28 overflow-y-auto rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink-soft">
                {selectedText.trim() || (
                  <span className="text-ink-faint">Nothing selected.</span>
                )}
              </div>
            </FieldShell>
          ) : (
            <Input
              label={mode === "section" ? "Topic / angle (optional)" : "Topic / angle"}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. How chemical safety teams adopt AI SDS management"
              disabled={busy}
            />
          )}

          {mode === "section" ? (
            <Input
              label="Section name"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="e.g. Key benefits"
              disabled={busy}
            />
          ) : null}

          {mode !== "rewrite" ? (
            <Input
              label="Target keyword(s)"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="comma-separated, e.g. SDS management, compliance"
              disabled={busy}
            />
          ) : null}

          {mode === "full_draft" || mode === "outline" ? (
            <Textarea
              label="Outline (optional)"
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              rows={3}
              placeholder="Provide section headings to follow, one per line."
              disabled={busy}
            />
          ) : null}

          <Input
            label="Length target (optional)"
            value={lengthTarget}
            onChange={(e) => setLengthTarget(e.target.value)}
            placeholder="e.g. ~800 words, short, long-form"
            disabled={busy}
          />

          <Input
            label="Knowledge-base tags (optional)"
            value={kbTags}
            onChange={(e) => setKbTags(e.target.value)}
            placeholder="comma-separated tags to scope retrieval"
            hint="Scopes grounding sources"
            disabled={busy}
          />
        </div>

        {/* Generate / Stop */}
        <div className="flex items-center gap-2">
          {busy ? (
            <Button variant="danger" onClick={gen.stop}>
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={runGenerate}
              disabled={!briefValid}
              loading={false}
            >
              {gen.status === "done" || gen.status === "error" || gen.status === "aborted"
                ? "Regenerate"
                : "Generate"}
            </Button>
          )}
          {busy ? (
            <span className="flex items-center gap-1.5 text-xs text-ink-mute">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              Streaming…
            </span>
          ) : null}
        </div>

        {/* Error states with code-specific remediation */}
        {gen.status === "error" && gen.error ? (
          <div className="space-y-2">
            <InlineError message={aiErrorMessage(gen.error.code, gen.error.message)} />
            {isRetryable(gen.error.code) ? (
              <Button variant="secondary" size="sm" onClick={runGenerate}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Preview pane (streaming tokens / final HTML) */}
        {(busy || gen.status === "done" || gen.partialText) && gen.status !== "error" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Preview</Label>
              {gen.status === "done" ? (
                <Badge tone="review">AI-assisted — review before publish</Badge>
              ) : null}
            </div>

            {gen.status === "done" && gen.result?.lowGrounding ? (
              <div
                role="alert"
                className="rounded-sm border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn"
              >
                ⚠ Low knowledge-base grounding — verify facts before publishing.
              </div>
            ) : null}

            <div className="max-h-72 overflow-y-auto rounded-sm border border-line bg-paper p-3.5">
              {gen.status === "done" ? (
                <div
                  className="tiptap prose-preview text-sm"
                  // Preview only; this content is sanitized server-side and is
                  // shown for review. It is NOT injected into the live document
                  // here — Insert merges the structured Tiptap doc instead.
                  dangerouslySetInnerHTML={{ __html: previewText }}
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-ink-soft">
                  {previewText || (
                    <span className="text-ink-faint">Waiting for output…</span>
                  )}
                </pre>
              )}
            </div>

            {gen.status === "done" && gen.result ? (
              <UsageLine done={gen.result} />
            ) : null}
          </div>
        ) : null}

        {/* Insert / Discard actions */}
        {canInsert && gen.result ? (
          <div className="space-y-3 border-t border-line pt-4">
            {mode !== "rewrite" && mode !== "section" ? (
              <FieldShell label="Insert as">
                <div className="flex gap-2">
                  <StrategyChip
                    label="Replace document"
                    active={strategy === "replace"}
                    onClick={() => setStrategy("replace")}
                  />
                  <StrategyChip
                    label="Append to document"
                    active={strategy === "append"}
                    onClick={() => setStrategy("append")}
                  />
                </div>
              </FieldShell>
            ) : (
              <p className="text-xs text-ink-mute">
                {mode === "rewrite"
                  ? "Insert replaces your current selection."
                  : "Insert appends the section at the end of the document."}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={handleInsert} loading={inserting}>
                Insert
              </Button>
              <Button variant="ghost" onClick={handleDiscard} disabled={inserting}>
                Discard
              </Button>
            </div>
            <p className="text-[11px] text-ink-faint">
              The item stays in Draft. Review the inserted content before publishing.
            </p>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

function StrategyChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-sm border px-3 py-1.5 text-[13px] transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent-ink"
          : "border-line-strong bg-paper-raised text-ink-soft hover:bg-paper-sunken",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function UsageLine({ done }: { done: SseDone }) {
  const { promptTokens, completionTokens, costUsd } = done.usage;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
      <span>
        {promptTokens + completionTokens} tokens
        {costUsd ? ` · $${costUsd.toFixed(4)}` : ""}
      </span>
      {done.sources.length > 0 ? (
        <span className="flex flex-wrap items-center gap-1">
          Sources:
          {done.sources.slice(0, 5).map((s, i) => (
            <Badge key={i} tone="neutral" className="max-w-[12rem] truncate">
              {s.title}
            </Badge>
          ))}
        </span>
      ) : null}
    </div>
  );
}
