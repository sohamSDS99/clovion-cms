/**
 * AI FAQ generation (draft-only, structured JSON).
 *
 * Unlike the streaming article generator (lib/ai/generate.ts, which emits a
 * Tiptap doc), a FAQ section is a small structured list of {question, answer}
 * pairs. This helper asks the model for a strict JSON array and validates it, so
 * the editor can drop the result straight into `typeData.faqItems` for review.
 *
 * HARD RULE: the result is always a DRAFT the author edits/keeps — nothing here
 * publishes or mutates content status.
 */
import { z } from "zod";
import { getConfig, getDecryptedKey } from "@/lib/ai/config";
import { createOpenRouterClient, type ChatMessage } from "@/lib/ai/openrouter";
import { faqItemSchema } from "@/lib/content/schemas";
import { parseFaqJson } from "@/lib/ai/faqParse";

export { parseFaqJson };

export interface GeneratedFaq {
  question: string;
  answer: string;
}

/** Upper bound on generated items regardless of requested count. */
export const MAX_FAQ_ITEMS = 10;

/** Carries a stable code so the route can map it to a helpful message. */
export class FaqGenError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "FaqGenError";
  }
}

/**
 * Generate FAQ items grounded in an article's title + body text. Throws
 * FaqGenError on missing config, upstream failure, or unusable output.
 */
export async function generateFaqItems(opts: {
  title: string;
  bodyText: string;
  count?: number;
  focus?: string;
}): Promise<GeneratedFaq[]> {
  const config = await getConfig();
  const apiKey = await getDecryptedKey();
  if (!apiKey || !config.defaultModel) {
    throw new FaqGenError(
      "ai_not_configured",
      "AI provider is not configured. Set an OpenRouter API key and a default model in Settings."
    );
  }

  const count = Math.min(Math.max(opts.count ?? 5, 1), MAX_FAQ_ITEMS);
  // Cap prompt size — a very long body doesn't need to ship in full.
  const context = opts.bodyText.trim().slice(0, 12000);

  const system =
    'You write concise FAQ entries for a marketing article. Return ONLY a JSON ' +
    'array of objects with string "question" and "answer" fields — no prose, no ' +
    "markdown fences. Each answer is 1–3 sentences, factual, and grounded in the " +
    "provided article. Never invent facts the article does not support.";

  const user = [
    `Article title: ${opts.title}`,
    opts.focus ? `Focus the questions on: ${opts.focus}` : "",
    `Generate ${count} frequently-asked questions with answers based on the article below.`,
    "",
    "ARTICLE:",
    context ||
      "(no body content yet — infer the questions a reader would likely ask from the title)",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  let content: string;
  try {
    const result = await createOpenRouterClient(apiKey).chatCompletion({
      model: config.defaultModel,
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
    content = result.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    throw new FaqGenError(
      "upstream_error",
      err instanceof Error ? err.message : "The AI request failed. Try again."
    );
  }

  const validated = z.array(faqItemSchema).safeParse(parseFaqJson(content));
  if (!validated.success || validated.data.length === 0) {
    throw new FaqGenError(
      "bad_output",
      "The model did not return usable FAQ items. Try again."
    );
  }
  return validated.data.slice(0, count);
}
