"use client";

import { useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import type { FaqItem } from "@/lib/ui/types";

/**
 * First-class repeatable Q&A editor — the PRIMARY content surface for an FAQ
 * article. Renders an ordered list of question + answer cards with add / remove
 * / reorder controls (no dnd dependency). Persists the whole list through
 * `onChange`. The publish gate (validateForPublish) needs >= 1 item; the
 * `error` for `typeData.faqItems` is surfaced inline.
 */
export function FaqQuestions({
  items,
  onChange,
  error,
  title = "Questions & answers",
  emptyTitle = "No questions yet",
  emptyBody = "Add the first question and answer. Each pair becomes an entry in the FAQ and the FAQPage schema.",
  action,
}: {
  items: FaqItem[];
  onChange: (next: FaqItem[]) => void;
  error?: string;
  /** Heading for the section (article layouts pass "FAQ section"). */
  title?: string;
  /** Empty-state card heading + body copy. */
  emptyTitle?: string;
  emptyBody?: string;
  /** Optional control rendered in the header (e.g. a "Generate with AI" button). */
  action?: React.ReactNode;
}) {
  // Track the just-added card so we can focus its question input.
  const focusIndex = useRef<number | null>(null);
  const questionRefs = useRef<Array<HTMLInputElement | null>>([]);

  const patch = (i: number, p: Partial<FaqItem>) =>
    onChange(items.map((it, j) => (j === i ? { ...it, ...p } : it)));

  const add = () => {
    focusIndex.current = items.length;
    onChange([...items, { question: "", answer: "" }]);
  };

  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    focusIndex.current = j;
    onChange(next);
  };

  // After a render where we added/moved, pull focus to the relevant question.
  if (focusIndex.current !== null) {
    const target = focusIndex.current;
    queueMicrotask(() => {
      questionRefs.current[target]?.focus();
    });
    focusIndex.current = null;
  }

  return (
    <section aria-labelledby="faq-questions-heading" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2
            id="faq-questions-heading"
            className="font-display text-lg font-semibold text-ink"
          >
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-ink-mute">
            {items.length === 0
              ? "Each Q&A pair becomes an entry in the FAQ and the FAQPage schema."
              : `${items.length} ${items.length === 1 ? "question" : "questions"} — drag-free reorder with the arrow controls.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {items.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={add}>
              Add question
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p
          className="rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
          <p className="font-display text-base text-ink">{emptyTitle}</p>
          <p className="max-w-sm text-sm text-ink-mute">{emptyBody}</p>
          <Button variant="primary" size="md" onClick={add}>
            Add question
          </Button>
        </Card>
      ) : (
        <ol className="space-y-4">
          {items.map((item, i) => (
            <li key={i}>
              <Card className="p-0">
                <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-paper-sunken font-display text-[13px] font-semibold text-ink-soft"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label={`Move question ${i + 1} up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp />
                    </IconButton>
                    <IconButton
                      label={`Move question ${i + 1} down`}
                      disabled={i === items.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown />
                    </IconButton>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label={`Remove question ${i + 1}`}
                      className="ml-1 rounded-sm px-2 py-1 text-xs font-medium text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <Input
                    ref={(el) => {
                      questionRefs.current[i] = el;
                    }}
                    label={`Question ${i + 1}`}
                    value={item.question}
                    placeholder="What would a reader ask?"
                    onChange={(e) => patch(i, { question: e.target.value })}
                  />
                  <Textarea
                    label="Answer"
                    rows={3}
                    value={item.answer}
                    placeholder="A clear, complete answer."
                    onChange={(e) => patch(i, { answer: e.target.value })}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-sm p-1.5 text-ink-mute transition-colors hover:bg-paper-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function ArrowUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}
