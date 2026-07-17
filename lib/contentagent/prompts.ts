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
import { sizeOptionsFor } from "./sizes";
import { BRAND_CORE, VOICE_PROFILES, FORMAT_PROFILES, PRODUCT_CORE, POST_TYPE_PROFILES } from "./voice";

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
  const postTypeProfile = POST_TYPE_PROFILES[run.postType];
  return [
    BRAND_CORE,
    VOICE_PROFILES[spec.voiceKey],
    ...(productBlock ? [productBlock] : []),
    ...(formatProfile ? [formatProfile] : []),
    ...(postTypeProfile ? [postTypeProfile] : []),
  ].join("\n\n");
}

function keywordsBlock(run: AgentRun): string {
  const kw = run.keywords ?? [];
  if (kw.length === 0) return "";
  const [primary, ...secondary] = kw;
  return `\n\nSEO KEYWORDS:\n- Primary: "${primary}" — use it in the title, in the first two paragraphs, and in at least one H2, always naturally.\n${
    secondary.length > 0
      ? `- Secondary: ${secondary.map((k) => `"${k}"`).join(", ")} — work each in once where it fits naturally.\n`
      : ""
  }- NEVER stuff or force keywords: substance over style is the brand rule, and unnatural repetition reads as spam to both readers and AI engines. Prefer question-form headings that contain the keyword over awkward exact-match phrasing.\n- Also output a meta description as the second HTML comment: <!--metaDescription: 140–155 characters, contains the primary keyword, states the article's answer plainly. -->`;
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
        !run.designSize && sizeOptionsFor(run.channel, run.format)
          ? `\n\nARTBOARD SIZE: recommend one of [${sizeOptionsFor(run.channel, run.format)!
              .map((s) => s.id)
              .join(", ")}] for this piece as "recommendedSize", with a one-line "sizeReason". Base it on the content: dense multi-section material and carousels want portrait (1080x1350); a single bold stat can carry a square; landscape only for one wide visual.`
          : ""
      }${
        run.allowResearch
          ? `\n\nRESEARCH (web_search tool available): every claim in the piece should be backed by data. Where a KEY claim needs a number that the brief/source material doesn't provide, search for it — prefer authoritative, recent sources (research firms, official reports, reputable industry studies). Rules: search ONLY for claims central to the piece (max 3 searches; 0 is fine when the brief has the data or the piece doesn't lean on external facts — e.g. founder stories). Record every found stat in researchFindings with its source and year; if you can't verify a number, don't include it.`
          : ""
      }\n\nRespond with STRICT JSON only (no code fences):\n{\n  "angle": "the one sharp idea this piece argues",\n  "hook": "the concrete first line or opening approach",\n  "structure": ["ordered section/beat descriptions"],\n  "keyPoints": ["each phrased as the READER'S business problem or stake first, with the supporting fact as its evidence — never a bare statistic or mechanic"],\n  "mustInclude": ["verbatim facts/numbers from the brief or source that must appear"],\n  "researchFindings": [{"stat": "the exact figure/claim", "source": "publisher name", "url": "source url", "year": "2026"}],\n  "recommendedSize": "1080x1350 (only when asked; else omit)",\n  "sizeReason": "one line (only when asked; else omit)",\n  "mustAvoid": ["traps specific to this piece: hype, claims we can't back, off-voice moves"],\n  "cta": "closing move appropriate to the channel (or empty string)"\n}`,
    },
    {
      role: "user",
      content: `${channelContext(run)}\n\nBRIEF:\n${run.brief}${keywordsBlock(run)}${sourceBlock(run)}`,
    },
  ];
}

export function writerMessages(run: AgentRun, plan: unknown): ChatMessage[] {
  const spec = channelSpec(run.channel);
  const formatRule =
    spec.format === "caption"
      ? run.format === "infographic"
        ? "Output the two parts exactly as specified in the format profile, in order: === GRAPHIC SPEC ===, === CAPTION ===. Plain text, no markdown code fences, no preamble."
        : run.format === "carousel"
          ? "Output the two parts exactly as specified in the format profile, in order: === SLIDES ===, === CAPTION ===. Plain text, no markdown code fences, no preamble."
          : "Output the caption as plain text exactly as it would be pasted into the platform. No preamble, no markdown, no surrounding quotes."
      : 'Output the article as clean HTML only (<h2>/<h3>, <p>, <ul>/<ol>/<li>, <strong>, <a>, <table>, <blockquote>). Start with the first <h2> or <p> — no <html>/<head>/<body>, no markdown, no preamble. Do NOT include the title as a heading; it is stored separately. Begin the output with a single HTML comment containing the title: <!--title: ... -->. Place [IMAGE n] markers per the voice rules, and AFTER the article output the === IMAGES === block describing every marker.';
  return [
    {
      role: "system",
      content: `You are Clovion's writer.\n\nORIGINALITY MANDATE (non-negotiable — this content is published and plagiarism-checked):\n- Every sentence must be written FRESH, in your own words. Source material, attachments, knowledge context, research findings, referenced pieces, and web results are INPUTS TO UNDERSTAND — never text to reproduce, paraphrase closely, or lightly reword.\n- Do NOT copy or near-copy phrasing, sentence structure, lists, or headings from any source. Synthesize the idea, then express it your own way.\n- Direct quotes are allowed ONLY when quoting is the point (a named expert/report), kept short (≤25 words), in quotation marks, with attribution. Everything else is original prose.\n- Facts and numbers come from the inputs; the WORDS are yours. Using a fact ≠ reusing the sentence that carried it.\n- Provided examples/references guide VOICE and STANCE only — never lift their wording.\n\nExecute the plan faithfully in the channel voice. Never invent numbers — only use facts from the brief, the source material, or the plan (including its researchFindings, which are verified). When you use a researchFinding, attribute it: articles link the source URL; captions name the source inline ("per Forrester, 2026").\n\n${voiceBlock(run)}\n\n${formatRule}`,
    },
    {
      role: "user",
      content: `${channelContext(run)}\n\nBRIEF:\n${run.brief}${keywordsBlock(run)}${sourceBlock(run)}\n\nWRITING PLAN (JSON):\n${JSON.stringify(plan, null, 2)}`,
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
  const spec = channelSpec(run.channel);
  const isArticle = spec.format === "article";

  const hardChecks = `HARD CHECKS (any failure = automatic fail, regardless of scores):\n0. ORIGINALITY: the draft must be original prose. Flag ANY passage that reproduces or closely paraphrases the source material, attachments, knowledge context, research findings, referenced pieces, or (when web search is available, check the actual top results) published web content — same sentences, structure, or lightly-reworded phrasing. Unattributed near-verbatim text = automatic fail; quote each offending passage and demand an original rewrite. Short attributed quotes (≤25 words, in quotation marks) are fine.\n1. FABRICATION: every number in the draft must exist in the brief/source material below or in the verified research findings. Any invented number = automatic fail. Numbers from research findings must carry their attribution.\n2. Banned words and channel rules (length, emoji/hashtag policy, structure, CTA style).\n3. NEGATIVE PARALLELISM: count every "not X, but Y" / "isn't A — it's B" / "X isn't the problem, Y is" construction, including in headings and microcopy. MORE THAN ONE in the piece = required fix, quoting each instance and demanding an affirmative rewrite.\n4. TITLES: the title must be the reader's search question or desired outcome in their words — reject mechanic-first, research-first, or vague-clever titles; a title the buyer wouldn't type or feel = required fix with a rewrite suggestion.\n5. CUSTOMER-FIRST FRAMING: every statistic and product mechanic must carry the reader's business stake before (or with) it — a bare "so what?" number anywhere (headings, captions, slides, microcopy included) = required fix with the stake→mechanism→evidence rewrite.`;

  if (!isArticle) {
    return [
      {
        role: "system",
        content: `You are Clovion's QA editor. You review drafts against the brand rubric with zero tolerance for hype and fabricated numbers. Be strict: a mediocre pass hurts the brand more than a rejection.\n\n${voiceBlock(run)}\n\n${hardChecks}\n6. CAROUSELS/SLIDES specifically: fail the draft if any slide carries more than one statistic, if any statistic repeats across slides, if the attribution appears more than once, if slides could be reordered without breaking the flow (no arc), if any slide uses labels like "What we found:"/"Why it matters:", or if any slide busts its word budget (slide 1: ≤8-word title + ≤12-word line; others: ≤6-word heading + ≤25-word body; final: ≤15-word takeaway + CTA). Count the words; quote every over-budget slide.\n\nAlso score the 30-second checklist.\n\nRespond with STRICT JSON only (no code fences):\n{\n  "pass": true|false,\n  "scores": { "leadsWithAnswer": 1-5, "calm": 1-5, "specific": 1-5, "numbersBacked": 1-5, "clarity": 1-5, "soundsHuman": 1-5 },\n  "requiredFixes": ["specific, actionable fixes — empty if pass"],\n  "notes": "one-paragraph editorial judgement"\n}`,
      },
      {
        role: "user",
        content: `${channelContext(run)}\n\nBRIEF:\n${run.brief}${sourceBlock(run)}${findingsBlock}\n\nDRAFT TO REVIEW:\n${draft}`,
      },
    ];
  }

  // Articles / lessons / lead magnets: the weighted editorial rubric.
  return [
    {
      role: "system",
      content: `You are Clovion's QA editor reviewing long-form content for publication. Be strict: a mediocre pass hurts the brand more than a rejection.\n\n${voiceBlock(run)}\n\n${hardChecks}\n6. ARTICLES: the === IMAGES === block must begin with a COVER entry (SIZE 1600x900) and every image must carry a valid SIZE (1600x900, 1200x800, or 1200x1200). If SEO keywords are specified: primary keyword in title, early paragraphs, and a heading — naturally; stuffing = required fix.\n\nWEIGHTED RUBRIC — score each 1–5 and compute weightedScore (0–100 = sum of score/5 × weight):\n- searchIntent (20%): does it fully answer the reader's likely question, aligned with the search intent (informational/commercial/comparison)?\n- informationGain (20%): does it add something the current top-ranking articles don't have? If a reader already read the top 5 results, what NEW thing do they learn here? Use web search on the primary keyword/title to check the actual top results when the tool is available; note what you compared against.\n- originalInsight (15%): at least one original insight, framework, opinion, recommendation, synthesis, or proprietary research? If not, is there a stated reason to publish anyway?\n- accuracyEvidence (15%): factual claims supported by reliable sources, statistics current, citations where appropriate?\n- depthCompleteness (10%): answers the obvious follow-up questions, no important subtopics missing, comprehensive for the target keyword?\n- readability (10%): clear headings, short paragraphs, logical flow, minimal jargon, easy to scan?\n- seoQuality (5%): natural keyword usage, good title + meta description, proper heading hierarchy, internal-linking opportunities used, external citations where appropriate?\n- brandAuthority (5%): reflects Clovion's real expertise and strengthens authority on the topic?\n\nADDITIONAL PASS/FAIL CHECKS (each with a one-line note):\n- expertise (E-E-A-T): real expertise rather than generic knowledge; practical examples; experience/case studies/real-world observations where possible.\n- uniqueness: structure not derivative of competing articles; not paraphrase; could NOT have been produced by combining existing articles.\n- actionability: the reader knows what to do after reading; recommendations concrete, not abstract.\n\nPUBLISH-OR-KILL — final question: "If this article already existed on another website, would we still choose to publish our own version?" Answer "publish" or "kill" with one sentence of reasoning.\n\nPASS RULE: pass = weightedScore ≥ 75 AND no criterion scored ≤ 2 AND all pass/fail checks pass AND publishOrKill = "publish" AND no hard-check failures. Otherwise fail with specific requiredFixes.\n\nRespond with STRICT JSON only (no code fences):\n{\n  "pass": true|false,\n  "weightedScore": 0-100,\n  "scores": { "searchIntent": 1-5, "informationGain": 1-5, "originalInsight": 1-5, "accuracyEvidence": 1-5, "depthCompleteness": 1-5, "readability": 1-5, "seoQuality": 1-5, "brandAuthority": 1-5 },\n  "checks": { "expertise": {"pass": true|false, "note": "…"}, "uniqueness": {"pass": true|false, "note": "…"}, "actionability": {"pass": true|false, "note": "…"} },\n  "publishOrKill": "publish"|"kill",\n  "publishOrKillReason": "one sentence",\n  "requiredFixes": ["specific, actionable fixes — empty if pass"],\n  "notes": "one-paragraph editorial judgement"\n}`,
    },
    {
      role: "user",
      content: `${channelContext(run)}\n\nBRIEF:\n${run.brief}${keywordsBlock(run)}${sourceBlock(run)}${findingsBlock}\n\nDRAFT TO REVIEW:\n${draft}`,
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

  // A reasoning model can emit stray "{" in prose before the real object, so
  // taking the first "{" is unsafe. Scan for the first BALANCED object (brace
  // matching, string/escape aware) and try each candidate until one parses.
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < cleaned.length; j++) {
      const c = cleaned[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const candidate = cleaned.slice(i, j + 1);
          try {
            return JSON.parse(candidate) as T;
          } catch {
            try {
              // Tolerate trailing commas + // line comments.
              const relaxed = candidate
                .replace(/\/\/[^\n]*/g, "")
                .replace(/,(\s*[}\]])/g, "$1");
              return JSON.parse(relaxed) as T;
            } catch {
              break; // this candidate is not the object; try the next "{"
            }
          }
        }
      }
    }
  }
  throw new Error("Model did not return parseable JSON.");
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

/** Pull title + meta description comments off an article draft. */
export function extractArticleMeta(draft: string): {
  title: string | null;
  metaDescription: string | null;
  body: string;
} {
  const { title, body } = extractArticleTitle(draft);
  const m = body.match(/^\s*<!--\s*metaDescription:\s*(.+?)\s*-->\s*/i);
  if (!m) return { title, metaDescription: null, body };
  return { title, metaDescription: m[1], body: body.slice(m[0].length) };
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


/** Render past approved pieces as few-shot memory ("" if none). This is the
 * project-style memory: real content we approved for this exact type, so the
 * writer matches proven voice and quality instead of starting cold. */
export function examplesBlock(examples: { title: string; text: string }[]): string {
  if (examples.length === 0) return "";
  const blocks = examples
    .map(
      (e, i) =>
        `--- APPROVED EXAMPLE ${i + 1}${e.title ? ` (${e.title})` : ""} ---\n${e.text.slice(0, 2000)}`
    )
    .join("\n\n");
  return `\n\nPROVEN EXAMPLES — pieces we PUBLISHED for this exact content type. Study them ONLY for voice, rhythm, and quality bar. These are already public: reusing their sentences or phrasing would be self-plagiarism. Learn the style, write something entirely new:\n\n${blocks}`;
}

/** Render manually-referenced past pieces the writer must stay CONSISTENT with
 * ("" if none). Stronger than examplesBlock: the user chose these because the
 * new piece continues or shares their topic, so framing/terminology/stance must
 * not be contradicted or reframed. Referenced text is quoted more generously
 * (the writer needs the substance, not just the style). */
export function referencesBlock(
  references: { title: string; text: string }[]
): string {
  if (references.length === 0) return "";
  const blocks = references
    .slice(0, 5)
    .map(
      (r, i) =>
        `--- REFERENCE ${i + 1}${r.title ? ` (${r.title})` : ""} ---\n${r.text.slice(0, 3000)}`
    )
    .join("\n\n");
  return `\n\nREFERENCED PAST CONTENT — this new piece CONTINUES or SHARES THE TOPIC of the following pieces (likely already published). Stay CONSISTENT with their framing, terminology, and stance, and build on them — but write 100% original sentences. These are public text: copying or lightly rewording them = plagiarism against our own live pages. Reference the ideas; never the wording:\n\n${blocks}`;
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


export const MAX_LESSONS = 10;

export interface SyllabusAsset {
  name: string;
  kind: "docx" | "xlsx";
  description: string;
}
export interface SyllabusLesson {
  n: number;
  title: string;
  brief: string;
  assets: SyllabusAsset[];
}
export interface Syllabus {
  courseTitle: string;
  lessons: SyllabusLesson[];
}

export function syllabusMessages(outline: AgentRun): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You convert an approved course outline into a machine-readable syllabus. Respond with STRICT JSON only (no code fences):\n{\n  "courseTitle": "…",\n  "lessons": [\n    {\n      "n": 1,\n      "title": "lesson title",\n      "brief": "2–4 sentence writing brief for this lesson: the question it answers, the key points, which data backs it",\n      "assets": [{ "name": "human-friendly file name", "kind": "docx" | "xlsx", "description": "what the template contains and how the reader uses it" }]\n    }\n  ]\n}\nRules: preserve the outline's lesson order and intent exactly. ASSETS: map every asset the outline names to its lesson; where the outline is silent but a lesson teaches a hands-on process, CREATE an appropriate downloadable (worksheet/template/script → docx; checklist/tracker/scorecard → xlsx). Not every lesson needs one, but the course as a whole must ship 3–6 practice assets — a course without downloads is incomplete. Max ${MAX_LESSONS} lessons.`,
    },
    {
      role: "user",
      content: `APPROVED COURSE OUTLINE:\n\n${outline.draftText ?? ""}`,
    },
  ];
}


/** Generate the "what it covers" brief for one manually-added lesson title. */
export function expandLessonMessages(args: {
  courseTitle: string;
  lessonTitle: string;
  outlineText: string;
  otherLessons: { title: string; brief: string }[];
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You write course-lesson briefs for Clovion (an AI visibility platform). Given a lesson title, produce the 2–4 sentence writing brief: the question the lesson answers, the 2–4 key points it should teach, and which Clovion research/data backs it where relevant. Stay consistent with the course outline and avoid overlapping what other lessons already cover. Respond with STRICT JSON only: {"brief": "…"}`,
    },
    {
      role: "user",
      content: `COURSE: ${args.courseTitle}\n\nNEW LESSON TITLE: ${args.lessonTitle}\n\nOTHER LESSONS (do not overlap):\n${args.otherLessons.map((l) => `- ${l.title}: ${l.brief}`).join("\n")}\n\nCOURSE OUTLINE:\n${args.outlineText.slice(0, 20000)}`,
    },
  ];
}
