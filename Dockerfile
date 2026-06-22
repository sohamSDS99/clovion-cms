# Clovion CMS — single image used by BOTH the web service and the worker
# service (Railway), with different start commands:
#   web:    pnpm start         (next start on $PORT)
#   worker: pnpm worker        (tsx lib/jobs/worker.ts — BullMQ scheduled jobs)
# Release/pre-deploy on the web service: pnpm release (prisma migrate deploy).

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy build-time env so module evaluation never trips; real values are
# injected at runtime by the platform. No secrets are baked into the image.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    DIRECT_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    AUTH_SECRET="build-time-only-not-used-at-runtime" \
    ENCRYPTION_KEY="YnVpbGQtdGltZS1lbmNyeXB0aW9uLWtleS0zMmJ5dGVz"
RUN pnpm prisma generate && pnpm build

# ── runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# Full app (node_modules + .next + source) so the same image can run either the
# Next server or the tsx worker.
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "start"]
