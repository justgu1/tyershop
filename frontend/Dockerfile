# syntax=docker/dockerfile:1.4
# ─── Dev stage ───────────────────────────────────────────────
FROM node:22-slim AS dev

WORKDIR /app

ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_LOGLEVEL=error

# copia lock do serviço e package do serviço
COPY frontend/package.json ./
COPY frontend/package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund \
  && npm install --no-audit --no-fund @astrojs/node@^10.0.6

# copia o código do serviço
COPY frontend/ ./

# roda em modo dev
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ─── Build stage ─────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_LOGLEVEL=error

COPY frontend/package.json frontend/package-lock.json* ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund \
  && npm install --no-audit --no-fund @astrojs/node@^10.0.6

COPY frontend/ ./

RUN npm run build

# ─── Production stage (Nginx) ─────────────────────────────────
FROM nginx:alpine AS prod

COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
