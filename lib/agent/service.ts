/**
 * Agent draft-create service.
 *
 * Hard rule (matches the AI writing engine): agent submissions are ALWAYS
 * drafts. This module never touches ContentItem.status and never invokes a
 * lifecycle transition — publishing stays a human action in the admin UI.
 *
 * Reuses createContent (slug uniqueness, revision cycle, audit) with the first
 * revision marked AI_GENERATION, and records an extra audit entry identifying
 * the API key that submitted the draft.
 */
import { BadRequestError } from "@/lib/api/http";
import type { SessionUser } from "@/lib/auth/guard";
import { createContent } from "@/lib/content/service";
import { htmlToTiptap } from "@/lib/ai/coerce";
import { recordAudit } from "@/lib/audit/service";
import type { AgentPrincipal } from "./keys";
import type { AgentCreateContentInput } from "./schemas";

export interface AgentDraftResult {
  id: string;
  type: string;
  title: string;
  slug: string;
  status: string;
  /** True if the HTML→Tiptap conversion had to fall back / drop content. */
  bodyNeedsReview: boolean;
}

export async function createAgentDraft(
  principal: AgentPrincipal,
  input: AgentCreateContentInput
): Promise<AgentDraftResult> {
  const authorProfileId = input.authorProfileId ?? principal.authorProfileId;
  if (!authorProfileId) {
    throw new BadRequestError(
      "No byline available: pass authorProfileId or configure one on the API key."
    );
  }
  if (!principal.mintedById) {
    throw new BadRequestError(
      "This API key has no owner on record; re-issue it with `pnpm agent:key create`."
    );
  }

  const { doc, needsReview } = htmlToTiptap(input.bodyHtml);

  // The acting identity for FK-backed creator columns is the admin who minted
  // the key. Capability enforcement happened at the key-scope check; the role
  // here is never consulted by createContent.
  const actingUser: SessionUser = {
    id: principal.mintedById,
    role: "CONTRIBUTOR",
    status: "ACTIVE",
    authorProfileId,
  };

  const item = await createContent(
    actingUser,
    {
      type: input.type,
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt,
      body: doc as unknown as Record<string, unknown>,
      tags: input.tags,
      seo: input.seo,
      typeData: input.typeData,
      categoryId: input.categoryId,
      authorProfileId,
    },
    {
      revisionSource: "AI_GENERATION",
      revisionNote:
        input.revisionNote ??
        `Submitted via agent API (key: ${principal.keyName})`,
    }
  );

  await recordAudit({
    actorId: principal.mintedById,
    entityType: "content",
    entityId: item.id,
    action: "agent_draft_submitted",
    diff: {
      via: "agent_api",
      keyId: principal.keyId,
      keyName: principal.keyName,
      bodyNeedsReview: needsReview,
    },
  });

  return {
    id: item.id,
    type: item.type,
    title: item.title,
    slug: item.slug,
    status: item.status,
    bodyNeedsReview: needsReview,
  };
}
