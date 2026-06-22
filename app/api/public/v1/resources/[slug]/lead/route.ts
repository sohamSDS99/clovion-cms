/**
 * POST /api/public/v1/resources/[slug]/lead — gated-resource lead capture
 * (FR §6.2 RESOURCE delta, NG3, NFR-SEC-03, PRD Q4).
 *
 * UNAUTHENTICATED (public submit). This is the SECURITY-CRITICAL flow:
 *   1. Resolve the PUBLISHED RESOURCE by slug. 404 if missing.
 *   2. If it is NOT gated -> 400 (there is no gate to unlock here; the public
 *      content endpoint already exposes ungated downloads).
 *   3. Resolve the referenced LeadForm (must be active) and validate the body
 *      against a schema *built from that form's fields* (required + email).
 *   4. Persist the submission, storing only a HASHED client IP (never raw).
 *   5. ONLY THEN look up the resource's PDF MediaAsset and mint a SHORT-LIVED
 *      (300s) signed download URL.
 *
 * The PDF URL is never returned without a successful submission (NFR-SEC-03).
 * Body: { email: string, data: Record<string, unknown> }.
 */
import { z } from "zod";
import {
  withRoute,
  json,
  parseQuery,
  parseBody,
  NotFoundError,
  BadRequestError,
} from "@/lib/api/http";
import { prisma } from "@/lib/db/prisma";
import { getPublishedByTypeSlug } from "@/lib/public/query";
import { getSignedDownloadUrl } from "@/lib/media/storage";
import { buildSubmissionSchema } from "@/lib/leadform/schemas";
import {
  readResourceGate,
  recordSubmission,
  hashClientIp,
  clientIpFromHeaders,
} from "@/lib/leadform/service";

export const runtime = "nodejs";

/** Signed PDF URL TTL — short-lived per NFR-SEC-03. */
const DOWNLOAD_TTL_SECONDS = 300;

const paramsSchema = z.object({ slug: z.string().min(1).max(300) });

export const POST = withRoute(
  async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
    const raw = await ctx.params;
    const { slug } = parseQuery(
      new URLSearchParams({ slug: raw.slug }),
      paramsSchema,
    );

    // (1) Resolve the published resource.
    const item = await getPublishedByTypeSlug("RESOURCE", slug);
    if (!item) throw new NotFoundError("Published resource not found.");

    // (2) Must actually be gated, with a lead form and a PDF to unlock.
    const gate = readResourceGate(item.typeData);
    if (!gate.gated || !gate.leadFormId) {
      throw new BadRequestError("This resource is not gated.");
    }
    if (!gate.pdfAssetId) {
      // Misconfigured gate: gated but no PDF attached.
      throw new BadRequestError("This resource has no downloadable file.");
    }

    // (3) Resolve + validate against the form's own field definitions.
    const form = await prisma.leadForm.findUnique({
      where: { id: gate.leadFormId },
    });
    if (!form || !form.isActive) {
      throw new BadRequestError("This resource's lead form is unavailable.");
    }

    const submissionSchema = buildSubmissionSchema(form.fields);
    const body = await parseBody(req, submissionSchema);

    // (4) Persist — store only a one-way hash of the client IP, never the raw IP.
    const ipHash = hashClientIp(clientIpFromHeaders(req.headers));
    await recordSubmission({
      leadFormId: form.id,
      contentId: item.id,
      email: body.email,
      data: body.data as Record<string, unknown>,
      ipHash,
    });

    // (5) Only AFTER a valid submission do we look up the PDF and sign a URL.
    const pdf = await prisma.mediaAsset.findFirst({
      where: { id: gate.pdfAssetId, deletedAt: null },
      select: { storageKey: true },
    });
    if (!pdf) {
      // Submission is captured, but the file vanished — surface a clean 404.
      throw new NotFoundError("The requested file is no longer available.");
    }

    const downloadUrl = await getSignedDownloadUrl(
      pdf.storageKey,
      DOWNLOAD_TTL_SECONDS,
    );

    // No-store: the signed URL is secret and per-request.
    const res = json({ downloadUrl, expiresInSeconds: DOWNLOAD_TTL_SECONDS });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
);
