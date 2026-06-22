# Clovion CMS

Standalone, **headless** content engine for the Clovion AI marketing website. It is
**fully separate** from the core Clovion AI product — its own repo, database, and
deployment. The public site consumes published content through a versioned read API
(`/api/public/v1`) plus publish webhooks and cache-purge.

Five content types share one lifecycle and one Tiptap editing surface: **blog posts,
webinars, news articles, downloadable resources, FAQ articles**.

> Full product spec lives in the PRD. This README covers local setup and the current
> build state.

## Status

**Phase 1 (MVP) — foundation in place.** Phase 2 = AI writing engine (OpenRouter + SOP +
Knowledge Base); config tables are scaffolded but generation is not wired yet.

| Area | State |
|---|---|
| Prisma schema (all §4 entities) + pgvector | ✅ migrated |
| Workflow state machine + role-gated transitions + publish gate | ✅ + unit tests |
| Auth.js v5 (credentials + OAuth) + RBAC capability matrix | ✅ + unit tests |
| Content/media/public APIs, Tiptap editor UI, scheduled-publish worker | ⏳ next |

## Stack

- **Next.js 15 (App Router) + TypeScript**, React 19, Tailwind
- **PostgreSQL 16 + Prisma 6**, `pgvector` for KB retrieval (Phase 2)
- **Redis + BullMQ** for scheduled-publish / AI jobs
- **Auth.js (NextAuth v5)** — email-invite credentials + OAuth, JWT sessions, role claims
- **S3-compatible storage** (MinIO locally) for media + gated PDFs

## Local development

Requires Docker, Node ≥ 20, and pnpm.

```bash
pnpm install
cp .env.example .env          # then set AUTH_SECRET / ENCRYPTION_KEY (openssl rand -base64 32)
pnpm db:up                    # Postgres + Redis + MinIO via docker compose
pnpm prisma:migrate           # apply migrations (creates pgvector extension + HNSW index)
pnpm dev                      # http://localhost:3000
```

### Local service ports

Remapped to avoid clashing with other local stacks:

| Service | Host port | In-container |
|---|---|---|
| Postgres (pgvector) | **5433** | 5432 |
| Redis | **6380** | 6379 |
| MinIO API / console | **9100 / 9101** | 9000 / 9001 |

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` | run / build the app |
| `pnpm test` | Vitest unit + integration suite |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | Next ESLint |
| `pnpm prisma:migrate` | create/apply migrations (dev) |
| `pnpm prisma:studio` | browse the DB |
| `pnpm worker` | run the BullMQ scheduled-publish worker |
| `pnpm db:up` / `pnpm db:down` | start / stop the docker stack |

## Layout

```
app/(admin)        authoring UI (editor, lists, media, settings)
app/api/content    content CRUD + lifecycle transitions
app/api/media      upload + library
app/api/users      invite / manage
app/api/public/v1  read API for the public website
lib/auth           Auth.js config + RBAC capability matrix + guards
lib/editor         Tiptap config
lib/workflow       lifecycle state machine + transition guards + publish gate
lib/jobs           BullMQ queues (scheduled publish)
lib/db             Prisma client
prisma/            schema + migrations
```

## Testing

- Workflow state machine: every allowed/denied transition.
- RBAC: every role × capability cell (incl. ownership + policy toggles).
- Publish validation gate: per content type.
