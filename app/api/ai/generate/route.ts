/**
 * POST /api/ai/generate — streaming AI draft generation (§6.1, FR-EDITOR-06).
 *
 * Requires `use_ai_write`. Responds with `text/event-stream` (SSE) per the shared
 * contract: each message is `data: <json>\n\n` where json is one of
 *   { type:"token", text }
 *   { type:"done", jobId, tiptap, html, lowGrounding, usage, sources }
 *   { type:"error", message, code }
 *
 * AI output is DRAFT ONLY — this route never publishes or mutates content status.
 * The editor merges the returned tiptap doc client-side and PATCHes
 * /api/content/{id} with source:"ai_generation" to persist an AI_GENERATION
 * revision.
 *
 * Because the success body is a streaming `Response` (not a `NextResponse`) we do
 * NOT wrap the POST in `withRoute`; instead pre-stream errors (auth/validation)
 * are mapped through the shared `errorResponse`, and any in-stream failure is
 * surfaced as a terminal SSE `error` frame.
 *
 * Client abort: the request's AbortSignal is forwarded into the generator so the
 * upstream OpenRouter stream is cancelled and the job is marked CANCELLED.
 */
import type { NextRequest } from "next/server";
import { withRoute, parseBody, json, errorResponse } from "@/lib/api/http";
import { requireCapability } from "@/lib/auth/guard";
import { generateRequestSchema } from "@/lib/ai/schemas";
import { runGeneration, type GenerationEvent } from "@/lib/ai/generate";

export const runtime = "nodejs";
// Generation can run longer than the default; keep the function alive for SSE.
export const maxDuration = 300;

function sseEncode(event: GenerationEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest): Promise<Response> {
  // Pre-stream phase: authorize + validate. Errors here become normal JSON
  // responses (not SSE) so the client can distinguish setup failures.
  let user: Awaited<ReturnType<typeof requireCapability>>;
  let input: Awaited<ReturnType<typeof parseBody<typeof generateRequestSchema>>>;
  try {
    user = await requireCapability("use_ai_write");
    input = await parseBody(req, generateRequestSchema);
  } catch (err) {
    return errorResponse(err);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runGeneration({
          user,
          req: input,
          signal: req.signal,
        })) {
          controller.enqueue(encoder.encode(sseEncode(event)));
        }
      } catch (err) {
        // Defensive: any unexpected throw becomes a terminal SSE error frame
        // rather than a dropped connection.
        const message =
          err instanceof Error ? err.message : "Unexpected generation error.";
        controller.enqueue(
          encoder.encode(
            sseEncode({ type: "error", code: "internal_error", message })
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// Guard: a stray GET on this endpoint returns a clear method hint.
export const GET = withRoute(async () => {
  await requireCapability("use_ai_write");
  return json(
    {
      error: {
        message: "Use POST to start a generation.",
        code: "method_not_allowed",
      },
    },
    405
  );
});
