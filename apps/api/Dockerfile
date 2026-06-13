# syntax=docker/dockerfile:1
# Dockerfile de la API (NestJS). Build multi-stage en monorepo pnpm.
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

# ── deps: instala dependencias del workspace ──
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile || pnpm install

# ── build ──
FROM deps AS build
COPY . .
RUN pnpm --filter @legalflow/domain build \
 && pnpm --filter @legalflow/compliance build \
 && pnpm --filter @legalflow/api prisma:generate \
 && pnpm --filter @legalflow/api build

# ── runtime ──
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
