FROM node:22-bookworm-slim
WORKDIR /worker
ENV NODE_ENV=production

COPY deploy/catalogue-r2-migration/package.json deploy/catalogue-r2-migration/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY backend/lib/objectStorage.js ./backend/lib/
COPY scripts/migrate-catalogue-to-r2.mjs ./scripts/
COPY scripts/lib/r2-catalogue-migration.mjs ./scripts/lib/
COPY scripts/deploy/verified-supabase-postgres.mjs scripts/deploy/postgres-url-guard.mjs ./scripts/deploy/
COPY deploy/certificates/supabase-prod-ca-2021.crt ./deploy/certificates/

# Approved execution must use a durable Railway volume writable by UID 1000.
# No media library, root app dependencies or credentials are copied into this image.
USER node
CMD ["node", "-e", "console.log('Catalogue R2 migration worker is disabled; configure an explicitly reviewed start command.')"]
