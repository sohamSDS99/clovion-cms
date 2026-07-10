/**
 * POST /api/content/[id]/faq/generate — AI-draft a FAQ section for an article.
 *
 * Requires `use_ai_write`. Returns `{ faqItems: {question, answer}[] }`, grounded
 * in the item's title + body. DRAFT ONLY — the editor merges the result into
 * `typeData.faqItems` for review; this route never publishes or mutates status.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withRoute, json, parseBody, BadRequestError } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { getContent } from "@/lib/content/service";
import { tiptapToPlainText, type TiptapDoc } from "@/lib/editor/diff";
import { generateFaqItems, FaqGenError, MAX_FAQ_ITEMS } from "@/lib/ai/faq";
import { rateLimit, hashIp, clientIpFromHeaders, tooMany } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z
  .object({
    count: z.coerce.number().int().min(1).max(MAX_FAQ_ITEMS).optional(),
    focus: z.string().max(200).optional(),
  })
  .strict();

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireCapability("use_ai_write");
  const { id } = await params;
  const input = await parseBody(req, bodySchema);

  // Same per-user budget as article generation (LLM cost + latency).
  const subject = user.id || `ip:${hashIp(clientIpFromHeaders(req.headers))}`;
  const rl = await rateLimit(`ai:faq:user:${subject}`, {
    limit: 20,
    windowSec: 60 * 60,
  });
  if (!rl.ok) return tooMany(rl.resetSec);

  const item = await getContent(id);

  try {
    const faqItems = await generateFaqItems({
      title: item.title,
      bodyText: tiptapToPlainText(item.body as TiptapDoc),
      count: input.count,
      focus: input.focus,
    });
    return json({ faqItems });
  } catch (err) {
    if (err instanceof FaqGenError) throw new BadRequestError(err.message);
    throw err;
  }
});
