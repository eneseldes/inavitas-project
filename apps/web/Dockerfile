# syntax=docker/dockerfile:1
#
# React SPA'yı derler, nginx ile servis eder (bkz. nginx.conf).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build -w packages/contracts \
  && npm run build -w packages/shared \
  && npm run build -w apps/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
