# syntax=docker/dockerfile:1.4
# ─── Dev stage ───────────────────────────────────────────────
FROM node:22-slim AS dev

WORKDIR /app

# instala medusa-cli globalmente
RUN npm install -g @medusajs/medusa-cli

# copia lock do serviço e package do serviço
COPY backend/package.json ./
COPY backend/package-lock.json* ./

COPY patches/ ./patches

RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund

# copia o código do serviço
COPY backend/ ./

# roda em modo dev
CMD ["npm", "run", "dev"]

# ─── Build stage ─────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./

COPY patches/ ./patches

RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund

COPY backend/ ./

ENV NODE_ENV=production
ENV MEDUSA_BACKEND_URL=https://medusa.homolog.tyershop.com

RUN npm run build

# ─── Production stage ─────────────────────────────────────────
FROM node:22-slim AS prod

WORKDIR /app

# `medusa build` gera o app pronto pra rodar em .medusa/server (com o próprio
# package.json) — é ele que vira a raiz do container, não o /app de build.
# Rodar "npm run start" a partir do /app de build (como antes) faz o loader
# do admin resolver o outDir errado (rootDirectory = cwd = /app em vez de
# .medusa/server), daí o "Could not find index.html in the admin build
# directory" mesmo com o build tendo funcionado certo.
COPY --chown=node:node --from=builder /app/.medusa/server ./
COPY --chown=node:node --from=builder /app/medusa-config.js ./

RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund

USER node

EXPOSE 9000
CMD ["npm", "run", "start"]
