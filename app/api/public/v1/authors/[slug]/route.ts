/**
 * GET /api/public/v1/authors/[slug] — a public author + their published items.
 *
 * UNAUTHENTICATED. 404 unless the AuthorProfile exists AND isPublic=true. Private
 * profiles (the default) are never exposed (FR §6.2). Returns the author's public
 * fields plus a lightweight list of their published content.
 */

import { z } from "zod";
import { withRoute, json, parseQuery, NotFoundError } from "@/lib/api/http";
import {
  getPublicAuthor,
  listPublishedByAuthor,
  resolveAvatarUrl,
  resolveAvatarUrls,
  avatarUrlFor,
} from "@/lib/public/query";
import { toPublicSummary } from "@/lib/public/serialize";
import { withCache } from "@/lib/public/cache";

export const runtime = "nodejs";

const paramsSchema = z.object({ slug: z.string().min(1).max(200) });

export const GET = withRoute(
  async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
    const raw = await ctx.params;
    const { slug } = parseQuery(
      new URLSearchParams({ slug: raw.slug }),
      paramsSchema,
    );

    const author = await getPublicAuthor(slug);
    if (!author) throw new NotFoundError("Author not found.");

    const items = await listPublishedByAuthor(author.id, 50);

    // Resolve the author's own avatar plus the avatars on their content list.
    const [authorAvatar, contentAvatars] = await Promise.all([
      resolveAvatarUrl(author.avatarAssetId),
      resolveAvatarUrls(items.map((it) => it.authorProfile?.avatarAssetId)),
    ]);

    const res = json({
      data: {
        author: {
          displayName: author.displayName,
          slug: author.slug,
          title: author.title ?? null,
          avatar: authorAvatar,
          bio: author.bio ?? null,
          socials: (author.socialLinks ?? {}) as Record<string, string>,
        },
        content: items.map((it) => toPublicSummary(it, avatarUrlFor(it, contentAvatars))),
      },
    });
    return withCache(res);
  },
);
