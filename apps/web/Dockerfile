# syntax=docker/dockerfile:1
# Dockerfile de la web (Next.js). Build multi-stage en monorepo pnpm.
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
COPY . .
RUN pnpm --filter @legalflow/domain build \
 && pnpm --filter @legalflow/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
