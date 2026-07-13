/**
 * Role prompts for the Content Agent pipeline.
 *
 * Three roles, three models (configurable in AIProviderConfig.agentModels):
 *  - orchestrator: expands the brief into a structured writing plan
 *  - writer: produces the draft from plan + voice + knowledge
 *  - qa: scores the draft against the brand rubric, demands fixes
 *
 * All role outputs that the pipeline must parse are strict JSON.
 */
import type { AgentRun } from "@prisma/client";
import type { ChatMessage } from "@/lib/ai/openrouter";
import { channelSpec } from "./channels";
import { BRAND_CORE, VOICE_PROFILES, FORMAT_PROFILES, PRODUCT_CORE } from "./voice";

/** Default model ids per role (overridable in Settings → AI Provider).
 * claude-* models call the Anthropic API; gpt-* models call the OpenAI API. */
export const DEFAULT_AGENT_MODELS = {
  orchestrator: "claude-fable-5",
  writer: "claude-sonnet-5",
  qa: "gpt-5.2",
} as const;

export type AgentRole = keyof typeof DEFAULT_AGENT_MODELS;

function channelContext(run: AgentRun): string {
  const spec = channelSpec(run.channel);
  const postType = spec.postTypes.find((p) => p.id === run.postType);
  const socialFormat = run.format
    ? spec.socialFormats?.find((f) => f.id === run.format)
    : undefined;
  return [
    `CHANNEL: ${spec.label}`,
    ...(socialFormat ? [`VISUAL FORMAT: ${socialFormat.label}`] : []),
    `POST TYPE: ${postType?.label ?? run.postType}`,
    `OUTPUT FORMAT: ${spec.format === "caption" ? "social media caption (plain text)" : "article (HTML)"}`,
  ].join("\n");
}

function voiceBlock(run: AgentRun): string {
  const spec = channelSpec(run.channel);
  const formatProfile = run.format ? FORMAT_PROFILES[run.format] : undefined;
  // Articles and lead magnets weave the product in — give them the product
  // knowledge. Social captions stay story-first and don't need it.
  const productBlock = spec.format === "article" ? PRODUCT_CORE : undefined;
  return [
    BRAND_CORE,
    VOICE_PROFILES[spec.voiceKey],
    ...(productBlock ? [productBlock] : []),
    ...(formatProfile ? [formatProfile] : []),
  ].join("\n\n");
}

function sourceBlock(run: AgentRun): string {
  if (!run.sourceReport) return "";
  return `\n\nSOURCE MATERIAL (the only place numbers may come from, besides the brief):\n<source>\n${run.sourceReport.slice(0, 60000)}\n</source>`;
}

export function orchestratorMessages(run: AgentRun): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are the content orchestrator for Clovion (an AI visibility platform). You turn a brief into a precise writing plan another model will execute. You do not write the piece.\n\n${voiceBlock(run)}${
        run.allowResearch
          ? `\n\nRESEARCH (web_search tool available): every claim in the piece should be backed by data. Where a KEY claim needs a number that the brief/source material doesn't provide, search for it — prefer authoritative, recent sources (research firms, official reports, reputable industry studies). Rules: search ONLY for claims central to the piece (max 3 searches; 0 is fine when the brief has the data or the piece doesn't lean on external facts — e.g. founder stories). Record every found stat in researchFindings with its source and year; if you can't verify a number, don't include it.`
          : ""
      }\n\nRespond with STRICT JSON only (no code fences):\n{\n  "angle": "the one sharp idea this piece argues",\n  "hook": "the concrete first line or opening approach",\n  "structure": ["ordered section/beat descriptions"],\n  "keyPoints": ["specific points to make, each with its supporting fact if available"],\n  "mustInclude": ["verbatim facts/numbers from the brief or source that must appear"],\n  "researchFindings": [{"stat": "the exact figure/claim", "source": "publisher name", "url": "source url", "year": "2026"}],\n  "mustAvoid": ["traps specific to this piece: hype, claims we can't back, off-voice moves"],\n  "cta": "closing move appropriate to the channel (or empty string)"\n}`,
    },
    {
      role: "user",
      content: `${channelContext(run)}\n\nBRIEF:\n${run.brief}${sourceBlock(run)}`,
    },
  ];
}

export function writerMessages(run: AgentRun, plan: unknown): ChatMessage[] {
  const spec = channelSpec(run.channel);
  const formatRule =
    spec.format === "caption"
      ? run.format === "infographic"
        ? "Output the three parts exactly as specified in the format profile, in order: === CONTENT ===, === GRAPHIC SPEC ===, === CAPTION ===. Plain text, no markdown code fences, no preamble."
        : run.format === "carousel"
          ? "Output the three parts exactly as specified in the format profile, in order: === CONTENT ===, === SLIDES ===, === CAPTION ===. Plain text, no markdown code fences, no preamble."
          : "Output the caption as plain text exactly as it would be pasted into the platform. No preamble, no markdown, no surrounding quotes."
      : 'Output the article as clean HTML only (<h2>/<h3>, <p>, <ul>/<ol>/<li>, <strong>, <a>, <table>, <blockquote>). Start with the first <h2> or <p> — no <html>/<head>/<body>, no markdown, no preamble. Do NOT include the title as a heading; it is stored separately. Begin the output with a single HTML comment containing the title: <!--title: ... -->. Place [IMAGE n] markers per the voice rules, and AFTER the article output the === IMAGES === block describing every marker.';
  return [
    {
      role: "system",
      content: `You are Clovion's writer. Execute the plan faithfully in the channel voice. Never invent numbers — only use facts from the brief, the source material, or the plan (including its researchFindings, which are verified). When you use a researchFinding, attribute it: articles link the source URL; captions name the source inline ("per Forrester, 2026").\n\n${voiceBlock(run)}\n\n${formatRule}`,
    },
    {
      role: "user",
      content: `${channelContext(run)}\n\nBRIEF:\n${run.brief}${sourceBlock(run)}\n\nWRITING PLAN (JSON):\n${JSON.stringify(plan, null, 2)}`,
    },
  ];
}

export function reviserMessages(
  run: AgentRun,
  plan: unknown,
  draft: string,
  fixes: string[]
): ChatMessage[] {
  const base = writerMessages(run, plan);
  return [
    base[0],
    {
      role: "user",
      content: `${channelContext(run)}\n\nBRIEF:\n${run.brief}${sourceBlock(run)}\n\nCURRENT DRAFT:\n${draft}\n\nREQUIRED CHANGES (apply all, change nothing else that already works):\n${fixes.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\nReturn the complete revised piece in the same output format.`,
    },
  ];
}

export function qaMessages(
  run: AgentRun,
  draft: string,
  researchFindings?: unknown[]
): ChatMessage[] {
  const findingsBlock =
    researchFindings && researchFindings.length > 0
      ? `\n\nVERIFIED RESEARCH FINDINGS (also allowed as number sources):\n${JSON.stringify(researchFindings, null, 2)}`
      : "";
  return [
    {
      role: "system",
      content: `You are Clovion's QA editor. You review drafts against the brand rubric with zero tolerance for hype and fabricated numbers. Be strict: a mediocre pass hurts the brand more than a rejection.\n\n${voiceBlock(run)}\n\nCheck, in order:\n1. FABRICATION: every number in the draft must exist in the brief/source material below or in the verified research findings. Any invented number = automatic fail. Numbers from research findings must carry their attribution.\n2. The 30-second checklist (all six).\n3. Channel rules (length, emoji/hashtag policy, structure, CTA style).\n4. Banned words.\n\nRespond with STRICT JSON only (no code fences):\n{\n  "pass": true|false,\n  "scores": { "leadsWithAnswer": 1-5, "calm": 1-5, "specific": 1-5, "numbersBacked": 1-5, "clarity": 1-5, "soundsHuman": 1-5 },\n  "requiredFixes": ["specific, actionable fixes — empty if pass"],\n  "notes": "one-paragraph editorial judgement"\n}`,
    },
    {
      role: "user",
      content: `${channelContext(run)}\n\nBRIEF:\n${run.brief}${sourceBlock(run)}${findingsBlock}\n\nDRAFT TO REVIEW:\n${draft}`,
    },
  ];
}

export function feedbackReviserMessages(
  run: AgentRun,
  plan: unknown,
  draft: string,
  feedbackNote: string
): ChatMessage[] {
  const base = writerMessages(run, plan);
  return [
    base[0],
    {
      role: "user",
      content: `${channelContext(run)}\n\nBRIEF:\n${run.brief}${sourceBlock(run)}\n\nCURRENT DRAFT:\n${draft}\n\nTHE HUMAN EDITOR'S FEEDBACK (highest priority — follow it even where it overrides the plan):\n${feedbackNote}\n\nReturn the complete revised piece in the same output format.`,
    },
  ];
}

/** Strip code fences and parse strict-JSON model output. */
export function parseJsonOutput<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON.");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

/** Pull the title out of an article draft's leading `<!--title: … -->` comment. */
export function extractArticleTitle(draft: string): {
  title: string | null;
  body: string;
} {
  const match = draft.match(/^\s*<!--\s*title:\s*(.+?)\s*-->\s*/i);
  if (!match) return { title: null, body: draft };
  return { title: match[1], body: draft.slice(match[0].length) };
}


/** Split a deliverable into content + spec + caption fields.
 * Handles 3-part (content/spec/caption), 2-part (spec/caption or
 * content/caption), and plain single-part outputs. */
export function splitDeliverable(raw: string): {
  content: string | null;
  spec: string | null;
  caption: string | null;
} {
  let rest = raw.trim();
  let caption: string | null = null;
  const capMatch = rest.match(/^([\s\S]*?)\n?===\s*CAPTION\s*===\s*\n?([\s\S]*)$/i);
  if (capMatch) {
    rest = capMatch[1].trim();
    caption = capMatch[2].trim() || null;
  }
  let content: string | null = null;
  let spec: string | null = null;
  const specMatch = rest.match(
    /^([\s\S]*?)\n?===\s*(GRAPHIC SPEC|SLIDES|IMAGES)\s*===\s*\n?([\s\S]*)$/i
  );
  if (specMatch) {
    content = specMatch[1].replace(/^===\s*CONTENT\s*===\s*\n?/i, "").trim() || null;
    spec = specMatch[3].trim() || null;
  } else {
    content = rest.replace(/^===\s*CONTENT\s*===\s*\n?/i, "").trim() || null;
  }
  return { content, spec, caption };
}

/** Reassemble the combined deliverable for revision/QA prompts. */
export function joinDeliverable(
  content: string | null,
  spec: string | null,
  caption: string | null
): string {
  const parts: string[] = [];
  if (content) parts.push(spec ? `=== CONTENT ===\n${content}` : content);
  if (spec) parts.push(`=== GRAPHIC SPEC ===\n${spec}`);
  if (caption) parts.push(`=== CAPTION ===\n${caption}`);
  return parts.join("\n\n");
}


/** Render active learned rules as a prompt block ("" if none). */
export function lessonsBlock(lessons: string[]): string {
  if (lessons.length === 0) return "";
  return `\n\nLEARNED STYLE RULES (from the editor's approved edits — follow these):\n${lessons
    .map((l, i) => `${i + 1}. ${l}`)
    .join("\n")}`;
}

/** Learner role: extract durable style rules from first output vs shipped. */
export function learnerMessages(args: {
  run: AgentRun;
  firstOutput: string;
  finalOutput: string;
  feedbackNotes: string[];
  existingLessons: string[];
}): ChatMessage[] {
  const { run, firstOutput, finalOutput, feedbackNotes, existingLessons } = args;
  return [
    {
      role: "system",
      content: `You extract durable writing preferences from the difference between an AI first draft and the version a human editor approved. Rules must be:\n- GENERALIZABLE style/format/voice preferences that apply to future pieces on this channel — never topic-specific facts, numbers, or one-off content changes\n- Concrete and actionable, max 140 characters each\n- Not duplicates or paraphrases of the existing rules provided\nReturn STRICT JSON only: {"lessons": ["…"]} with 0–3 entries. Return {"lessons": []} if the changes were topic-specific or too minor to generalize. Be conservative: a wrong rule pollutes every future piece.`,
    },
    {
      role: "user",
      content: `CHANNEL: ${run.channel}${run.format ? ` (format: ${run.format})` : ""}\n\nEXISTING RULES (do not repeat):\n${existingLessons.map((l) => `- ${l}`).join("\n") || "(none)"}\n\nEDITOR FEEDBACK NOTES DURING REVISION:\n${feedbackNotes.map((n) => `- ${n}`).join("\n") || "(none)"}\n\nAI FIRST OUTPUT:\n${firstOutput.slice(0, 20000)}\n\nAPPROVED FINAL VERSION:\n${finalOutput.slice(0, 20000)}`,
    },
  ];
}


/** Remove [IMAGE n] markers (and marker-only paragraphs) from article HTML,
 * so the stored content is clean, paste-ready copy. Placement lives in the
 * IMAGES block instead. */
export function stripImageMarkers(html: string): string {
  return html
    .replace(/<p>\s*\[IMAGE\s+\d+\]\s*<\/p>/gi, "")
    .replace(/^\s*\[IMAGE\s+\d+\]\s*$/gim, "")
    .replace(/\[IMAGE\s+\d+\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
