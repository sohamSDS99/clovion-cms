# Clovion CMS — single image used by BOTH the web service and the worker
# service (Railway), with different start commands:
#   web:    pnpm start         (next start on $PORT)
#   worker: pnpm worker        (tsx lib/jobs/worker.ts — BullMQ scheduled jobs)
# Release/pre-deploy on the web service: pnpm release (prisma migrate deploy).

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# openssl: required by the Prisma query engine (avoids libssl detection fallback).
# ca-certificates: outbound HTTPS (OpenRouter, S3, webhooks).
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Activate the pinned pnpm at build time so containers don't download it on boot.
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy DB URLs so the Prisma datasource resolves during build. The app never
# connects at build time (DB-touching routes are force-dynamic). Real runtime
# values are injected by the platform; no secrets are baked into the image.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    DIRECT_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN pnpm prisma generate && pnpm build

# ── runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# Full app (node_modules + .next + source) so the same image can run either the
# Next server or the tsx worker.
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "start"]
