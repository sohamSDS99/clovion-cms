# Deploying Clovion CMS

**Topology:** app on **Railway** (two services from one image — `web` + `worker`),
database on **Supabase** (Postgres + pgvector), Redis on **Railway** (for BullMQ),
object storage S3-compatible (Supabase Storage or Railway bucket).

The image (see `Dockerfile`) runs either service:
- **web** — `pnpm start` (Next.js on `$PORT`), pre-deploy `pnpm release` (`prisma migrate deploy`)
- **worker** — `pnpm worker` (scheduled-publish + webinar jobs)

---

## 1. Supabase (database) — you do this

1. Create a Supabase project.
2. **Database → Extensions**: enable `vector`.
3. **Project Settings → Database → Connection string** — grab both:
   - **Pooled** (Transaction, port `6543`) → `DATABASE_URL`
     append `?pgbouncer=true&connection_limit=1`
   - **Direct** (Session, port `5432`) → `DIRECT_URL`
4. (Optional, for media) **Storage → S3 connection**: create a bucket + S3 access keys;
   note the S3 endpoint/region.

Migrations run automatically via the web service pre-deploy (`prisma migrate deploy`,
which uses `DIRECT_URL`).

## 2. Railway (app + Redis) — I can provision this

1. New project from the GitHub repo `sohamSDS99/clovion-cms`.
2. Add a **Redis** database (gives `REDIS_URL`).
3. **web service** — builds from `Dockerfile` (`railway.json` sets start `pnpm start`,
   pre-deploy `pnpm release`, healthcheck `/api/health`). Generate a public domain.
4. **worker service** — same repo/image, **start command `pnpm worker`**, no domain,
   no healthcheck.

## 3. Environment variables (set on BOTH services unless noted)

| Var | Value |
|---|---|
| `DATABASE_URL` | Supabase pooled URL (`…:6543/…?pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | Supabase direct URL (`…:5432/postgres`) |
| `REDIS_URL` | Railway Redis URL |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` (32 bytes; encrypts the OpenRouter key) |
| `AUTH_URL` / `NEXTAUTH_URL` | the web service public URL (web only) |
| `EMAIL_FROM`, `SMTP_URL` (or `SMTP_HOST/PORT/USER/PASS`) | invites/notifications (optional — logs if unset) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`, `S3_FORCE_PATH_STYLE` | media storage (Supabase Storage S3 or Railway bucket) |
| `PUBLIC_SITE_URL` | the public marketing site origin (canonical URLs, JSON-LD, sitemap) |
| `PUBLIC_SITE_WEBHOOK_URL`, `PUBLIC_SITE_CACHE_PURGE_TOKEN` | publish webhook to the public site (optional) |
| `OPENROUTER_BASE_URL`, `OPENROUTER_APP_TITLE`, `OPENROUTER_HTTP_REFERER` | defaults are fine; the API **key** is set in-app (Settings → AI), stored encrypted |
| `ORG_SELF_PUBLISH`, `ORG_NEWS_FAST_PUBLISH` | optional seed defaults (policy is DB-backed + editable in Settings) |

> `AUTH_SECRET`, `ENCRYPTION_KEY`, `SMTP_*`, `S3_*` must match between web and worker
> where both use them. `ENCRYPTION_KEY` must be identical (it decrypts the stored AI key).

## 4. First boot

1. Deploy. Pre-deploy runs `prisma migrate deploy` (creates schema + `vector` + HNSW index).
2. Seed the first admin (run once, e.g. Railway shell or locally against prod `DATABASE_URL`):
   ```
   SEED_ADMIN_EMAIL=you@clovion.ai SEED_ADMIN_PASSWORD='<strong>' pnpm db:seed
   ```
   Then log in and **change the password**. (Do not ship the `ChangeMe123!` default.)
3. **Settings → AI**: paste the OpenRouter key, pick models, Test connection.
4. **Settings**: review the org policy toggles. Invite your team from **Users**.

## 5. Notes / follow-ups
- Image is intentionally non-standalone so one image runs web + worker; a standalone
  web image is a future size optimization.
- Rate limiting is Redis-backed and fail-open (a Redis outage won't 500 endpoints).
- Error monitoring (Sentry, etc.) is not wired — add before heavy traffic (NFR-OBS-01).
