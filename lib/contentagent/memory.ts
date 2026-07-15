/**
 * Semantic "content memory" for the Content Agent.
 *
 * Approved runs (and, where wired, published CMS items) are embedded into the
 * `content_memory` table so future generations can stay consistent with past
 * work — both auto-retrieved (topically similar pieces) and manually
 * referenced (the user picks specific prior pieces).
 *
 * The `embedding` column is pgvector, modeled as Prisma `Unsupported`, so every
 * read/write of it goes through raw SQL (`$queryRaw`/`$executeRaw`) — never a
 * typed Prisma select of `embedding`. Mirrors the KB retrieval pattern in
 * `lib/kb/retrieve.ts`.
 *
 * EVERYTHING here is best-effort: memory is an enhancement, so a missing
 * embedding provider or a failing query must never break generation or
 * approval. All entry points swallow errors and degrade gracefully.
 */
import { prisma } from "@/lib/db/prisma";
import { embedOne } from "@/lib/kb/embed";
import { joinDeliverable, extractArticleTitle } from "./prompts";
import type { AgentChannel } from "@prisma/client";

/** Format a number[] embedding as a pgvector literal: `[0.1,0.2,...]`.
 * Pure, exported for testing. Non-finite values are dropped defensively so a
 * bad vector never produces invalid SQL (the row simply keeps no embedding). */
export function embeddingToPgvectorLiteral(vec: number[]): string {
  return `[${vec.filter((n) => Number.isFinite(n)).join(",")}]`;
}

/** A memory hit projected for callers (never includes the raw embedding). */
export interface MemoryHit {
  sourceType: string;
  sourceId: string;
  title: string;
  text: string;
  score: number;
}

/** Row shape for the manual-reference picker. */
export interface MemorySearchHit {
  id: string;
  title: string;
  sourceType: string;
  snippet: string;
}

/** Derive a human title for an indexed agent run. */
function runTitle(args: {
  draftText: string | null;
  brief: string;
}): string {
  const { title } = extractArticleTitle(args.draftText ?? "");
  if (title && title.trim()) return title.trim().slice(0, 200);
  const firstLine = args.brief.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return firstLine.slice(0, 200) || "Untitled";
}

/**
 * Index (upsert) an approved AgentRun into content_memory. Best-effort: if
 * there is no embedding provider, or embedding/SQL throws, it logs nothing and
 * returns — approval must never fail because of memory.
 */
export async function indexApprovedRun(runId: string): Promise<void> {
  try {
    const run = await prisma.agentRun.findUnique({ where: { id: runId } });
    if (!run) return;
    const text = joinDeliverable(run.draftText, run.specText, run.captionText).trim();
    if (!text) return;

    const title = runTitle({ draftText: run.draftText, brief: run.brief });

    // Upsert the row WITHOUT the embedding (Prisma can't write the vector
    // column). Re-approval updates the stored text/title in place.
    const row = await prisma.contentMemory.upsert({
      where: {
        sourceType_sourceId: { sourceType: "agent_run", sourceId: run.id },
      },
      create: {
        sourceType: "agent_run",
        sourceId: run.id,
        channel: run.channel,
        postType: run.postType,
        title,
        text,
        createdById: run.createdById,
      },
      update: { channel: run.channel, postType: run.postType, title, text },
      select: { id: true },
    });

    // Embed + write the vector via raw SQL. If the provider is unconfigured or
    // the embed call throws, we keep the row (embedding stays NULL) so it can
    // still be found by the title fallback search.
    let vec: number[];
    try {
      vec = await embedOne(text.slice(0, 8000));
    } catch {
      return; // no embedding available — row exists without a vector
    }
    const literal = embeddingToPgvectorLiteral(vec);
    await prisma.$executeRaw`
      UPDATE content_memory
      SET embedding = ${literal}::vector
      WHERE id = ${row.id}::uuid
    `;
  } catch {
    // Best-effort: memory indexing never surfaces errors to the caller.
  }
}

interface RetrieveArgs {
  query: string;
  channel?: AgentChannel | null;
  /** Exclude memory rows sourced from this id (e.g. the run being generated). */
  excludeSourceId?: string;
  k?: number;
  threshold?: number;
}

interface RawHit {
  sourceType: string;
  sourceId: string;
  title: string;
  text: string;
  score: number;
}

/**
 * Retrieve up to `k` topically-similar memory pieces above `threshold`.
 * Optionally scoped to a channel, but NEVER hard-filtered by postType —
 * cross-type topical relevance within a channel matters more than exact type.
 * Best-effort: returns [] on any embed/query failure.
 */
export async function retrieveMemory(args: RetrieveArgs): Promise<MemoryHit[]> {
  const k = Math.max(1, args.k ?? 3);
  const threshold = args.threshold ?? 0.15;
  const query = (args.query ?? "").trim();
  if (!query) return [];

  try {
    const vec = await embedOne(query.slice(0, 8000));
    const literal = embeddingToPgvectorLiteral(vec);
    const exclude = args.excludeSourceId ?? "";
    const channel = args.channel ?? null;

    // Channel is filtered as text (channel::text = $chan) to avoid enum-cast
    // fragility across drivers; postType is intentionally NOT filtered.
    const rows = channel
      ? await prisma.$queryRaw<RawHit[]>`
          SELECT "sourceType" AS "sourceType",
                 "sourceId"::text AS "sourceId",
                 title AS title,
                 text AS text,
                 1 - (embedding <=> ${literal}::vector) AS score
          FROM content_memory
          WHERE embedding IS NOT NULL
            AND "sourceId"::text <> ${exclude}
            AND channel::text = ${channel}
          ORDER BY embedding <=> ${literal}::vector
          LIMIT ${k}
        `
      : await prisma.$queryRaw<RawHit[]>`
          SELECT "sourceType" AS "sourceType",
                 "sourceId"::text AS "sourceId",
                 title AS title,
                 text AS text,
                 1 - (embedding <=> ${literal}::vector) AS score
          FROM content_memory
          WHERE embedding IS NOT NULL
            AND "sourceId"::text <> ${exclude}
          ORDER BY embedding <=> ${literal}::vector
          LIMIT ${k}
        `;

    return rows
      .map((r) => ({
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        title: r.title,
        text: r.text,
        score: typeof r.score === "number" ? r.score : Number(r.score),
      }))
      .filter((r) => r.score >= threshold);
  } catch {
    return [];
  }
}

/**
 * Fetch specific memory rows by id (for manual references). Plain Prisma, no
 * vector column. Order is not guaranteed by the DB, so we re-order to match the
 * caller's `ids`. Best-effort: [] on error.
 */
export async function getMemoryByIds(ids: string[]): Promise<MemoryHit[]> {
  const wanted = ids.filter(Boolean);
  if (wanted.length === 0) return [];
  try {
    const rows = await prisma.contentMemory.findMany({
      where: { id: { in: wanted } },
      select: { id: true, sourceType: true, sourceId: true, title: true, text: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return wanted
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => ({
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        title: r.title,
        text: r.text,
        score: 1,
      }));
  } catch {
    return [];
  }
}

/**
 * Search memory for the manual-reference picker. Embeds `q` for a semantic
 * match; if embedding is unavailable/fails, falls back to a case-insensitive
 * title `contains` search. Returns id + title + sourceType + a short snippet.
 */
export async function searchMemory(q: string, limit = 10): Promise<MemorySearchHit[]> {
  const query = (q ?? "").trim();
  if (!query) return [];
  const take = Math.max(1, Math.min(limit, 10));

  // Try semantic search first.
  try {
    const vec = await embedOne(query.slice(0, 8000));
    const literal = embeddingToPgvectorLiteral(vec);
    const rows = await prisma.$queryRaw<
      { id: string; title: string; sourceType: string; text: string }[]
    >`
      SELECT id::text AS id,
             title AS title,
             "sourceType" AS "sourceType",
             text AS text
      FROM content_memory
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${take}
    `;
    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        sourceType: r.sourceType,
        snippet: (r.text ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
      }));
    }
    // Fall through to the title search when nothing is embedded yet.
  } catch {
    // Embedding unavailable — use the title fallback below.
  }

  try {
    const rows = await prisma.contentMemory.findMany({
      where: { title: { contains: query, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, title: true, sourceType: true, text: true },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      sourceType: r.sourceType,
      snippet: (r.text ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
    }));
  } catch {
    return [];
  }
}
