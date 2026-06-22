/**
 * Publish-to-site webhook (FR §6.2 publish-to-site, PRD Q6).
 *
 * When a content item is published or unpublished, we notify the public site so
 * it can revalidate / purge its CDN cache for that path. This is fire-and-forget:
 * the function NEVER throws into the caller (content lifecycle must not fail just
 * because the website's webhook is down). Failures are logged only.
 *
 * Config (env):
 *   PUBLIC_SITE_WEBHOOK_URL        — destination; if unset, the webhook is skipped.
 *   PUBLIC_SITE_CACHE_PURGE_TOKEN  — bearer token sent as Authorization header.
 *
 * Slug-change 301 hint (PRD Q6): when a published item's slug changes, the site
 * needs to 301 the old path to the new one. Callers pass `previousSlug` so we can
 * include a `redirectFrom` hint in the payload.
 */

import type { ContentItem } from "@prisma/client";

export type PublishWebhookAction = "publish" | "unpublish";

/** Optional extras the caller can supply about this lifecycle event. */
export interface PublishWebhookOptions {
  /** Previous slug, when it changed during this publish (drives a 301 on the site). */
  previousSlug?: string;
}

/** The compact JSON payload delivered to the public site. */
export interface PublishWebhookPayload {
  action: PublishWebhookAction;
  id: string;
  type: ContentItem["type"];
  slug: string;
  /** Lower-cased content type segment + slug, e.g. "blog/my-post". */
  path: string;
  publishedAt: string | null;
  /** Present only on a slug change — old path the site should 301 from. */
  redirectFrom?: string;
  /** Emit time, for ordering/dedupe on the receiver. */
  firedAt: string;
}

/** Timeout so a hung receiver can't block the lifecycle for long. */
const WEBHOOK_TIMEOUT_MS = 5_000;

function pathFor(type: ContentItem["type"], slug: string): string {
  return `${type.toLowerCase()}/${slug}`;
}

/**
 * Best-effort POST to the public site webhook. Resolves to `true` when the site
 * acknowledged (2xx), `false` otherwise (or when not configured / on error).
 * Guaranteed not to throw.
 */
export async function firePublishWebhook(
  item: Pick<ContentItem, "id" | "type" | "slug" | "publishedAt">,
  action: PublishWebhookAction,
  options: PublishWebhookOptions = {},
): Promise<boolean> {
  const url = process.env.PUBLIC_SITE_WEBHOOK_URL;
  if (!url) {
    // Not configured — silently skip (valid in local/dev).
    return false;
  }

  const payload: PublishWebhookPayload = {
    action,
    id: item.id,
    type: item.type,
    slug: item.slug,
    path: pathFor(item.type, item.slug),
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    firedAt: new Date().toISOString(),
    ...(options.previousSlug && options.previousSlug !== item.slug
      ? { redirectFrom: pathFor(item.type, options.previousSlug) }
      : {}),
  };

  const token = process.env.PUBLIC_SITE_CACHE_PURGE_TOKEN;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "clovion-cms-webhook/1",
  };
  if (token) headers["authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(
        `[webhooks/publish] ${action} webhook returned ${res.status} for ${payload.path}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    // Network error / timeout / abort — log and swallow.
    console.error(`[webhooks/publish] ${action} webhook failed for ${payload.path}:`, err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
