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

RUN npm run build

# ─── Production stage ─────────────────────────────────────────
FROM node:22-slim AS prod

WORKDIR /app

COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
# Medusa 2 (`medusa build`) gera `.medusa/server` + `.medusa/admin`, não `dist`
COPY --chown=node:node --from=builder /app/.medusa ./.medusa
COPY --chown=node:node --from=builder /app/medusa-config.js ./

USER node

EXPOSE 9000
CMD ["npm", "run", "start"]
