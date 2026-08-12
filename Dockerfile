# syntax=docker/dockerfile:1
#
# The production image: one container, one origin — the SPA and the API served
# by the same Node process, so there is no CORS surface, no second deployment to
# keep in step, and no reverse-proxy rule to get wrong.
#
#   docker build -t you-go-further .
#   docker run -p 8787:8787 --env-file deploy/env.example you-go-further
#
# Three things it deliberately does:
#
# 1. **Configures at start, not at build.** `host-config.mjs` runs in the
#    entrypoint, so the same image tag runs in staging and production and is
#    reconfigured by environment variables. An image that bakes its API URL has
#    to be rebuilt to be moved, which is how staging ends up pointing at prod.
# 2. **Runs the preflight before the server.** A production container that is
#    missing its signing secret must fail to start, loudly, rather than come up
#    healthy and hand out sessions anyone can forge.
# 3. **Runs as a non-root user under a real init.** `tini` reaps zombies and
#    passes SIGTERM through, which is what makes the graceful shutdown in
#    `server/index.ts` actually run during a rolling deploy.

# ---- Build: the SPA -------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Optional sub-path hosting, e.g. --build-arg BASE_PATH=/app
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
RUN npm run build

# ---- Runtime dependencies only --------------------------------------------
# A separate stage so the ~200 MB of build tooling never reaches the final
# image. `tsx` is a runtime dependency on purpose: the server runs from
# TypeScript, which is the same path the unit suite and the e2e journey
# exercise. Shipping a differently-built server would mean verifying one
# artefact and deploying another.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Runtime ---------------------------------------------------------------
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app

ENV NODE_ENV=production \
    APP_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    STORE_BACKEND=postgres \
    ALLOW_ROLE_SWITCHING=false \
    TRUST_PROXY=true

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY package.json ./
COPY src     ./src
COPY server  ./server
COPY scripts/host-config.mjs scripts/preflight.ts ./scripts/
COPY docker-entrypoint.sh ./

# Two directories have to be writable by the user that writes them, and that
# user is not root: `dist/`, because `config.js` is written at start-up, and
# the data directory, because the file backend creates it on first write. The
# image defaults to Postgres, but `docker compose up` and every "try it on a
# VM" path use the file store — and without this the container died at
# start-up with EACCES on /app/.data, which is not a failure anyone would
# guess from "permission denied" in a log they had to go looking for.
RUN chmod +x docker-entrypoint.sh \
 && mkdir -p /app/.data \
 && chown -R node:node /app/dist /app/.data
USER node

EXPOSE 8787
# Hits the real API route, which reads the store — a container that cannot
# reach its database is not healthy, however well its socket is listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
