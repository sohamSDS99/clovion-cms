/**
 * Agent API keys — authentication for the external agent API (/api/agent/v1).
 *
 * Keys are long random secrets shown once at mint time; only a sha256 hash is
 * stored (`ApiKey.keyHash`). Verification is a constant-time-safe hash lookup.
 * Scopes gate what a key may do; v1 issues only "content:draft:create", which
 * structurally cannot publish (see lib/agent/service.ts — status is forced to
 * DRAFT and no lifecycle transition is ever invoked).
 */
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { AuthzError } from "@/lib/auth/rbac";

/** Scope required to create drafts through the agent API. */
export const SCOPE_DRAFT_CREATE = "content:draft:create";

const KEY_PREFIX = "agk_";

/** The authenticated principal an API key resolves to. */
export interface AgentPrincipal {
  keyId: string;
  keyName: string;
  scopes: string[];
  /** Byline profile configured on the key (typically an isGhost AuthorProfile). */
  authorProfileId: string | null;
  /** The admin user who minted the key (real users row; used for createdById). */
  mintedById: string | null;
}

/** Generate a new plaintext key + its stored fields. Plaintext is returned once. */
export function generateAgentKey(): {
  plaintext: string;
  keyHash: string;
  keyPrefix: string;
} {
  const plaintext = KEY_PREFIX + randomBytes(32).toString("hex");
  return {
    plaintext,
    keyHash: hashAgentKey(plaintext),
    keyPrefix: plaintext.slice(0, KEY_PREFIX.length + 8),
  };
}

/** sha256 hex digest of a plaintext key. Never store or log the plaintext. */
export function hashAgentKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Extract the bearer key from `Authorization: Bearer …` or `x-api-key`. */
export function extractKeyFromRequest(req: Request): string | null {
  const authz = req.headers.get("authorization");
  if (authz?.toLowerCase().startsWith("bearer ")) {
    const token = authz.slice(7).trim();
    if (token) return token;
  }
  const headerKey = req.headers.get("x-api-key")?.trim();
  return headerKey || null;
}

/**
 * Authenticate a request with an agent API key and assert the given scope.
 * Throws AuthzError 401 (missing/unknown/expired/revoked key) or 403 (scope).
 */
export async function requireAgentKey(
  req: Request,
  scope: string
): Promise<AgentPrincipal> {
  const plaintext = extractKeyFromRequest(req);
  if (!plaintext || !plaintext.startsWith(KEY_PREFIX)) {
    throw new AuthzError("A valid agent API key is required.", 401);
  }

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashAgentKey(plaintext) },
  });
  if (!key) throw new AuthzError("Unknown API key.", 401);
  if (key.revokedAt) throw new AuthzError("This API key has been revoked.", 401);
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) {
    throw new AuthzError("This API key has expired.", 401);
  }
  if (!key.scopes.includes(scope)) {
    throw new AuthzError(`This API key lacks the "${scope}" scope.`, 403);
  }

  // Best-effort usage timestamp; never fail the request over it.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    keyId: key.id,
    keyName: key.name,
    scopes: key.scopes,
    authorProfileId: key.authorProfileId,
    mintedById: key.createdById,
  };
}
