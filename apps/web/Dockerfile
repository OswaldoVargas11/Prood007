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
# Next.js hornea las NEXT_PUBLIC_* en build → deben llegar como build-arg.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Sentry de cliente (opcional): si se pasa el DSN como build-arg, se hornea y se activa la captura de
# errores en el navegador; si no, el SDK ni siquiera entra en el bundle (coste cero). Ver SENTRY_SETUP.md.
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
ENV NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
RUN pnpm --filter @legalflow/domain build \
 && pnpm --filter @legalflow/web build

FROM base AS runtime
ENV NODE_ENV=production
# next start escucha en este host/puerto (0.0.0.0 para que Fly lo alcance).
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# HOME del usuario `node` (cache de pnpm escribible).
ENV HOME=/home/node
COPY --from=build /repo /repo
WORKDIR /repo/apps/web
EXPOSE 3000
# No correr como root (hardening). `node` (uid 1000) viene en node:alpine; solo lee /repo y sirve Next.
USER node
CMD ["pnpm", "start"]
