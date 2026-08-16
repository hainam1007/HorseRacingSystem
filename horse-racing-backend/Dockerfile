# Build context: repo root (see docker-compose.yml)
# Run from repo root:
#   docker build -f horse-racing-backend/Dockerfile -t horse-racing-backend .
#
# Multi-stage: install deps, then copy runtime + schema assets.
FROM node:20-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY horse-racing-backend/package.json horse-racing-backend/package-lock.json* ./horse-racing-backend/
RUN cd horse-racing-backend && npm install --omit=dev --no-audit --no-fund

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_LOGLEVEL=warn

# Install psql client for DB readiness probe + a tiny wait loop helper.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Production node_modules
COPY --from=deps /app/horse-racing-backend/node_modules ./horse-racing-backend/node_modules

# Backend source
COPY horse-racing-backend/ ./horse-racing-backend/

# Schema bootstrap assets (copied at build time so the container can init the DB)
COPY migration/apply-schema.js ./migration/apply-schema.js
COPY migration/schema/001_init_postgres.sql ./001_init_postgres.sql

# Entrypoint waits for Postgres, optionally applies the schema, then runs the server.
COPY horse-racing-backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/horse-racing-backend

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "./bin/www"]