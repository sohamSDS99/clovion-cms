/**
 * GET /api/public/v1/resources/[slug] — public gated-safe view of a RESOURCE
 * (FR §6.2 RESOURCE delta, NG3, NFR-SEC-03, PRD Q4).
 *
 * UNAUTHENTICATED. Returns the public content payload (via the shared serializer,
 * which already strips the PDF URL for gated resources) PLUS, when the resource
 * is gated, the lead form *definition* (fields) so the public site can render the
 * capture form. It NEVER returns the PDF download URL — that is only issued by the
 * sibling POST .../lead route after a valid submission (NFR-SEC-03).
 *
 * 404 when the slug is not a PUBLISHED, non-deleted RESOURCE.
 */
import { z } from "zod";
import { withRoute, json, parseQuery, NotFoundError } from "@/lib/api/http";
import {
  getPublishedGatedBySlug,
  resolveAvatarUrl,
  resolveResourceDownloadUrl,
} from "@/lib/public/query";
import { toPublicContent } from "@/lib/public/serialize";
import { withCache } from "@/lib/public/cache";
import { prisma } from "@/lib/db/prisma";
import { readResourceGate, toPublicLeadForm } from "@/lib/leadform/service";

export const runtime = "nodejs";

const paramsSchema = z.object({ slug: z.string().min(1).max(300) });

export const GET = withRoute(
  async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
    const raw = await ctx.params;
    const { slug } = parseQuery(
      new URLSearchParams({ slug: raw.slug }),
      paramsSchema,
    );

    // Resolves a published RESOURCE or RESEARCH by slug — both are gated
    // downloads served from this endpoint under one /resources URL space.
    const item = await getPublishedGatedBySlug(slug);
    if (!item) throw new NotFoundError("Published resource not found.");

    // Shared serializer already enforces "no PDF URL for gated resources".
    const avatarUrl = await resolveAvatarUrl(item.authorProfile?.avatarAssetId);
    const downloadUrl = await resolveResourceDownloadUrl(item);
    const payload = toPublicContent(item, avatarUrl, downloadUrl);

    // When gated, attach the lead form definition (fields only) for rendering.
    const gate = readResourceGate(item.typeData);
    let leadForm = null;
    if (gate.gated && gate.leadFormId) {
      const form = await prisma.leadForm.findUnique({
        where: { id: gate.leadFormId },
      });
      // Only surface an ACTIVE form; otherwise the resource is effectively
      // un-unlockable and we omit the form (site can show a fallback).
      if (form && form.isActive) {
        leadForm = toPublicLeadForm(form);
      }
    }

    const res = json({
      data: {
        ...payload,
        // Where to POST the submission to unlock the download.
        leadSubmitUrl: gate.gated
          ? `/api/public/v1/resources/${item.slug}/lead`
          : null,
        leadForm,
      },
    });
    return withCache(res, { noStore: payload.seo.noIndex });
  },
);
