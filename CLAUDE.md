# CLAUDE.md — Clovion CMS

Guidance for AI coding sessions in this repo.

## What this is

Standalone **headless** CMS for the Clovion AI marketing site. It is **fully separate**
from the core Clovion AI product (the `~/Clovion AI` / `~/Clovion AI Console` apps): no
shared runtime, DB, or auth. The public website is a separate codebase that reads
published content from `/api/public/v1` and reacts to publish webhooks/cache-purge.

Five content types (BLOG, WEBINAR, NEWS, RESOURCE, FAQ) share one lifecycle and one
Tiptap editor; type-specific fields live in `ContentItem.typeData` (single-table
inheritance).

## Build phases

- **Phase 1 (current):** auth/roles, shared Tiptap editor, 5 content types, lifecycle
  (draft → in_review → scheduled → published → unpublished/archived), media library,
  public read API, audit log.
- **Phase 2:** AI writing engine — OpenRouter (sole LLM gateway), Writing SOP, Knowledge
  Base (pgvector retrieval). Config tables exist; generation not wired yet.
- AI output is **always draft-only** and never auto-publishes (hard rule).

## Hard rules / conventions

- **Authorization is server-side.** Every mutating route authorizes via the RBAC matrix
  in `lib/auth/rbac.ts` (`can()` / `assertCan()` / `requireCapability()`); never trust the
  UI. `🟡` capabilities require ownership checks.
- **Lifecycle transitions** go through `lib/workflow` — `authorizeTransition()` returns
  409 for an invalid state move, 403 for an insufficient role. Don't bypass it.
- **Publish gate**: `validateForPublish()` in `lib/workflow/validation.ts` (FR-CONTENT-09).
- `lib/workflow` and `lib/auth/rbac.ts` are **dependency-free pure modules** (no Prisma /
  next-auth imports) so they stay unit-testable. Keep them that way.
- Prisma enum values are **UPPERCASE** (e.g. `"DRAFT"`, `"ADMIN"`); the workflow/rbac
  string-literal unions mirror them exactly.
- Generic creator columns (`createdById`, `updatedById`, `uploadedById`, …) are
  **FK-less UUID columns** by design — the app enforces those references, not the DB.
- `ContentItem.slug` is unique **per type** (`@@unique([type, slug])`).
- Secrets (OpenRouter key) are **encrypted at rest** — never return or log plaintext.

## Local ports (remapped to avoid clashes with the `nexus` stack)

Postgres **5433**, Redis **6380**, MinIO **9100/9101**. See `.env` / `docker-compose.yml`.

## Before committing

`pnpm typecheck && pnpm lint && pnpm test` should pass. CI (`.github/workflows/ci.yml`)
runs these plus `prisma migrate deploy` against an ephemeral Postgres.
