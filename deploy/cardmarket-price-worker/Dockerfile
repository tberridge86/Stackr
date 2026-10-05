FROM node:22-bookworm-slim
WORKDIR /app
COPY deploy/cardmarket-price-worker/package.json deploy/cardmarket-price-worker/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY scripts/cardmarket-db-reviewed-ledger.mjs scripts/cardmarket-daily-worker.mjs scripts/classify-catalogue-pricing.mjs scripts/cardmarket-daily-guide.mjs scripts/cardmarket-cached-ingestion.mjs scripts/cardmarket-public-guide.mjs scripts/catalogue-price-fx.mjs scripts/catalogue-price-database.mjs scripts/pricing-v2-supabase-target.mjs ./scripts/
CMD ["timeout","50m","sh","-c","node scripts/cardmarket-db-reviewed-ledger.mjs && node scripts/cardmarket-daily-worker.mjs"]
