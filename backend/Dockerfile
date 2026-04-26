# ─── Dev stage ───────────────────────────────────────────────
FROM node:22-slim AS dev

WORKDIR /app

# instala medusa-cli globalmente
RUN npm install -g @medusajs/medusa-cli

# copia lock do serviço e package do serviço
COPY backend/package.json ./
# Tentamos copiar o lock se existir, mas usamos npm install para garantir sincronia
COPY backend/package-lock.json* ./

COPY patches/ ./patches

# instala dependências (usando install em vez de ci para dev)
RUN npm install

# copia o código do serviço
COPY backend/ ./

# roda em modo dev
CMD ["npm", "run", "dev"]

# ─── Build stage ─────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./

COPY patches/ ./patches

RUN npm install

COPY backend/ ./

RUN npm run build

# ─── Production stage ─────────────────────────────────────────
FROM node:22-slim AS prod

WORKDIR /app

COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/medusa-config.ts ./

USER node

EXPOSE 9000
CMD ["npm", "run", "start"]
