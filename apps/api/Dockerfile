# syntax=docker/dockerfile:1
# Dockerfile de la API (NestJS). Build multi-stage en monorepo pnpm.
FROM node:20-alpine AS base
# openssl: Prisma lo necesita para detectar libssl en Alpine (si falta, avisa y puede fallar).
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo

# ── deps: instala dependencias del workspace ──
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
# El postinstall de la API ejecuta `prisma generate`, que necesita el schema → copiarlo antes.
COPY apps/api/prisma ./apps/api/prisma
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
