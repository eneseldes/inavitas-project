# syntax=docker/dockerfile:1
#
# Tek imaj, dört servis. access-service/outage-service/work-order-service/gateway
# aynı monorepo yapısını paylaşır. Tek bir imaj derlenir ve docker-compose.yml
# içerisinde her servis için farklı `command:` seçeneği ile yeniden kullanılır.

FROM node:22-alpine AS base
WORKDIR /app

# --- Bağımlılıklar: sadece package.json'lar kopyalanır ki kaynak değişse de
#     bu katman önbellekten gelsin (npm ci en pahalı adım). ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/access-service/package.json services/access-service/package.json
COPY services/outage-service/package.json services/outage-service/package.json
COPY services/work-order-service/package.json services/work-order-service/package.json
COPY services/gateway/package.json services/gateway/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# --- Derleme: contracts/shared önce (diğerleri buna bağımlı), sonra 4 servis. ---
FROM deps AS build
COPY . .
RUN npm run build -w packages/contracts \
  && npm run build -w packages/shared \
  && npm run build -w services/access-service \
  && npm run build -w services/outage-service \
  && npm run build -w services/work-order-service \
  && npm run build -w services/gateway
RUN npm prune --omit=dev

# --- Çalışma zamanı: sadece derlenmiş çıktı + prod bağımlılıkları. ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/services ./services
