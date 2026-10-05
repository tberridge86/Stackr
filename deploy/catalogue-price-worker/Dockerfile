FROM node:22-bookworm-slim
WORKDIR /worker
COPY deploy/catalogue-price-worker/package.json deploy/catalogue-price-worker/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY scripts/run-catalogue-price-cron.mjs scripts/refresh-catalogue-bulk-prices.mjs scripts/classify-catalogue-pricing.mjs scripts/catalogue-bulk-coverage-report.mjs scripts/catalogue-price-database.mjs scripts/catalogue-price-fx.mjs scripts/pricing-v2-supabase-target.mjs ./scripts/
USER node
CMD ["node", "scripts/run-catalogue-price-cron.mjs"]
