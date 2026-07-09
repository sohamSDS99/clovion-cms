/**
 * Deterministic prompt assembly for the §6.1 AI generation engine.
 *
 * PURE + I/O-FREE: takes already-fetched `sop` and `chunks` and returns the
 * OpenRouter `ChatMessage[]` in the DETERMINISTIC block order required by §6.1:
 *
 *   1. SYSTEM   — role + guardrails (draft-only; no fabricated product facts;
 *                 ground claims only in the provided KB; follow the SOP exactly).
 *   2. SOP      — the active SOP body for this content type, pinned verbatim.
 *   3. KNOWLEDGE— top-K KB chunks, de-duplicated, token-budgeted, each tagged
 *                 with its source title.
 *   4. TASK     — the brief + content type + keywords + outline, plus an explicit
 *                 OUTPUT CONTRACT constraining the allowed HTML node set.
 *   5. FORMAT   — a short format reminder + length target.
 *
 * Token-overflow handling (§6.1 edge case): when the assembled prompt exceeds the
 * budget we trim the LOWEST-score KB chunks first, then truncate the brief's free
 * text. We NEVER drop the SOP block or the OUTPUT CONTRACT — those are load-bearing
 * for correctness and the draft-only guarantee.
 *
 * Determinism is a critical correctness point: the same inputs must always yield
 * the same message array (same order, same trimming decisions).
 */

import type { ChatMessage } from "@/lib/ai/openrouter";

export type AiGenerationMode = "full_draft" | "section" | "rewrite" | "outline";
export type PromptContentType = "BLOG" | "RESEARCH" | "WEBINAR" | "NEWS" | "RESOURCE" | "FAQ";

/** Free-form authoring brief supplied by the editor. */
export interface GenerationBrief {
  topic?: string;
  keywords?: string[];
  outline?: string;
  sectionName?: string;
  selectedText?: string;
  lengthTarget?: string;
}

/** A KB chunk as returned by `retrieveChunks`, plus its source title. */
export interface PromptChunk {
  chunkText: string;
  score: number;
  kbItemId: string;
  /** Human-readable source title for attribution in the KNOWLEDGE block. */
  sourceTitle?: string;
}

/** The active SOP body (just what we need for the pinned SOP block). */
export interface PromptSop {
  id: string;
  version: number;
  body: string;
}

export interface AssemblePromptArgs {
  mode: AiGenerationMode;
  contentType: PromptContentType;
  brief: GenerationBrief;
  sop: PromptSop | null;
  chunks: PromptChunk[];
  /**
   * Soft budget (in characters, a cheap proxy for tokens) for the WHOLE prompt.
   * When the assembled prompt exceeds this, KB chunks (lowest score first) then
   * the brief free-text are trimmed. SOP + OUTPUT CONTRACT are never dropped.
   * Defaults to a generous bound that won't trim typical prompts.
   */
  charBudget?: number;
}

export interface AssembledPrompt {
  messages: ChatMessage[];
  /** Diagnostics for the job's promptAssembly record + tests. */
  meta: {
    chunkIdsUsed: string[];
    chunksDropped: number;
    briefTruncated: boolean;
  };
}

/** The allowed output HTML node set — the OUTPUT CONTRACT, kept in one place. */
export const ALLOWED_HTML_TAGS = [
  "h2",
  "h3",
  "h4",
  "p",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "strong",
  "em",
  "table",
  "tr",
  "th",
  "td",
] as const;

const OUTPUT_CONTRACT = `OUTPUT CONTRACT (must follow exactly):
Return ONLY valid HTML using exclusively these tags: ${ALLOWED_HTML_TAGS.join(
  ", "
)}. Do not use h1, div, span, section, img, script, style, or any other tag. Do not wrap the output in a code fence. Do not include <html>, <head> or <body> wrappers. Headings start at h2 (the article title is supplied separately).`;

// ── SYSTEM block ──────────────────────────────────────────────────────────────

function systemBlock(): ChatMessage {
  return {
    role: "system",
    content: [
      "You are a meticulous content writer producing a DRAFT for a human editor to review.",
      "Hard guardrails (never violate):",
      "- This is DRAFT ONLY. You are not publishing; a human reviews and approves everything you produce.",
      "- Do NOT fabricate product facts, statistics, customer names, pricing, dates, or capabilities. If a fact is not present in the KNOWLEDGE below, do not assert it.",
      "- Ground all factual claims ONLY in the provided KNOWLEDGE block. When the KNOWLEDGE is empty or weak, stay general and avoid specific claims.",
      "- Follow the WRITING SOP below EXACTLY in voice, structure, and constraints.",
      "- Obey the OUTPUT CONTRACT in the task block precisely.",
    ].join("\n"),
  };
}

// ── SOP block ───────────────────────────────────────────────────────────────--

function sopBlock(sop: PromptSop | null): ChatMessage {
  if (!sop) {
    return {
      role: "system",
      content:
        "WRITING SOP:\n(No active SOP is configured for this content type. Apply professional, neutral marketing-blog conventions: clear structure, scannable headings, no fluff.)",
    };
  }
  return {
    role: "system",
    content: `WRITING SOP (id=${sop.id} v${sop.version}) — follow exactly:\n${sop.body}`,
  };
}

// ── KNOWLEDGE block ────────────────────────────────────────────────────────────

/**
 * De-duplicate chunks by normalized text (keeping the highest score) and sort
 * descending by score so the most relevant context appears first and the lowest
 * scoring chunks are the first to be trimmed under budget pressure.
 */
function dedupeAndRank(chunks: PromptChunk[]): PromptChunk[] {
  const byText = new Map<string, PromptChunk>();
  for (const c of chunks) {
    const key = c.chunkText.trim().replace(/\s+/g, " ").toLowerCase();
    if (!key) continue;
    const existing = byText.get(key);
    if (!existing || c.score > existing.score) byText.set(key, c);
  }
  return [...byText.values()].sort((a, b) => b.score - a.score);
}

function renderKnowledge(chunks: PromptChunk[]): string {
  if (chunks.length === 0) {
    return "KNOWLEDGE BASE:\n(No grounding context was retrieved. Do not invent facts; keep claims general.)";
  }
  const parts = chunks.map((c, i) => {
    const title = c.sourceTitle?.trim() || `Source ${i + 1}`;
    return `[Source: ${title}]\n${c.chunkText.trim()}`;
  });
  return `KNOWLEDGE BASE (ground all claims ONLY in these sources):\n\n${parts.join(
    "\n\n---\n\n"
  )}`;
}

// ── TASK block ────────────────────────────────────────────────────────────────

function modeInstruction(
  mode: AiGenerationMode,
  brief: GenerationBrief
): string {
  switch (mode) {
    case "full_draft":
      return "TASK: Write a complete first-draft article on the topic below.";
    case "section":
      return `TASK: Write ONLY the section titled "${
        brief.sectionName?.trim() || "(unnamed section)"
      }". Output just that section's content (you may lead with an h2/h3 for it).`;
    case "rewrite":
      return `TASK: Improve and rewrite the SELECTED TEXT below while preserving its meaning. Return only the rewritten passage.\n\nSELECTED TEXT:\n${
        brief.selectedText?.trim() || "(none provided)"
      }`;
    case "outline":
      return "TASK: Produce ONLY an outline of headings (h2/h3/h4) for an article on the topic below. Use heading tags only — no paragraph body text.";
  }
}

function renderTask(
  mode: AiGenerationMode,
  contentType: PromptContentType,
  brief: GenerationBrief,
  briefTruncated: boolean,
  truncatedTopic?: string,
  truncatedOutline?: string
): string {
  const lines: string[] = [];
  lines.push(modeInstruction(mode, brief));
  lines.push("");
  lines.push(`CONTENT TYPE: ${contentType}`);

  const topic = truncatedTopic ?? brief.topic;
  if (topic && topic.trim()) lines.push(`TOPIC: ${topic.trim()}`);

  if (brief.keywords && brief.keywords.length > 0) {
    lines.push(`TARGET KEYWORDS: ${brief.keywords.join(", ")}`);
  }

  const outline = truncatedOutline ?? brief.outline;
  if (outline && outline.trim() && mode !== "outline") {
    lines.push(`SUGGESTED OUTLINE:\n${outline.trim()}`);
  }

  if (briefTruncated) {
    lines.push(
      "(Note: the brief was truncated to fit the context budget. Work with what is provided.)"
    );
  }

  lines.push("");
  lines.push(OUTPUT_CONTRACT);
  return lines.join("\n");
}

// ── FORMAT reminder block ───────────────────────────────────────────────────--

function renderFormat(brief: GenerationBrief): string {
  const length = brief.lengthTarget?.trim();
  const lengthLine = length
    ? `Length target: ${length}.`
    : "Length: use editorial judgement appropriate to the type.";
  return `FORMAT REMINDER: Return valid HTML using only the allowed tags (${ALLOWED_HTML_TAGS.join(
    ", "
  )}). ${lengthLine} No preamble, no closing remarks, no code fences — output the HTML directly.`;
}

// ── Budget accounting ───────────────────────────────────────────────────────--

/** Cheap token proxy — character length of all message contents. */
function promptCharLength(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0);
}

const DEFAULT_CHAR_BUDGET = 48_000; // ~12k tokens, generous default.
const MIN_BRIEF_CHARS = 200; // never truncate the brief below this.

/**
 * Assemble the deterministic prompt. Pure: no I/O, no Date, no randomness.
 */
export function assemblePrompt(args: AssemblePromptArgs): AssembledPrompt {
  const { mode, contentType, brief, sop } = args;
  const charBudget = args.charBudget ?? DEFAULT_CHAR_BUDGET;

  const ranked = dedupeAndRank(args.chunks);

  // Work on a mutable copy we can trim (lowest score = end of the ranked list).
  let usedChunks = [...ranked];
  let chunksDropped = 0;
  let briefTruncated = false;
  let truncatedTopic = brief.topic;
  let truncatedOutline = brief.outline;

  // Fixed blocks that are NEVER trimmed.
  const system = systemBlock();
  const sopMsg = sopBlock(sop);

  const build = (): ChatMessage[] => {
    const knowledge: ChatMessage = {
      role: "system",
      content: renderKnowledge(usedChunks),
    };
    const task: ChatMessage = {
      role: "user",
      content: renderTask(
        mode,
        contentType,
        brief,
        briefTruncated,
        truncatedTopic,
        truncatedOutline
      ),
    };
    const format: ChatMessage = { role: "user", content: renderFormat(brief) };
    // DETERMINISTIC ORDER: SYSTEM, SOP, KNOWLEDGE, TASK, FORMAT.
    return [system, sopMsg, knowledge, task, format];
  };

  // 1) Trim lowest-score KB chunks until within budget (or none remain).
  let messages = build();
  while (promptCharLength(messages) > charBudget && usedChunks.length > 0) {
    usedChunks = usedChunks.slice(0, -1);
    chunksDropped += 1;
    messages = build();
  }

  // 2) Still over budget with no chunks left — truncate the brief free-text.
  //    Truncate the outline first, then the topic, never below MIN_BRIEF_CHARS.
  if (promptCharLength(messages) > charBudget) {
    const overBy = promptCharLength(messages) - charBudget;

    if (truncatedOutline && truncatedOutline.length > MIN_BRIEF_CHARS) {
      const keep = Math.max(MIN_BRIEF_CHARS, truncatedOutline.length - overBy);
      if (keep < truncatedOutline.length) {
        truncatedOutline = truncatedOutline.slice(0, keep);
        briefTruncated = true;
      }
    }
    messages = build();

    if (promptCharLength(messages) > charBudget && truncatedTopic) {
      const stillOver = promptCharLength(messages) - charBudget;
      const keep = Math.max(MIN_BRIEF_CHARS, truncatedTopic.length - stillOver);
      if (keep < truncatedTopic.length) {
        truncatedTopic = truncatedTopic.slice(0, keep);
        briefTruncated = true;
      }
    }
    messages = build();
  }

  return {
    messages,
    meta: {
      chunkIdsUsed: usedChunks.map((c) => c.kbItemId),
      chunksDropped,
      briefTruncated,
    },
  };
}
