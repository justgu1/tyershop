# ─── Dev stage ───────────────────────────────────────────────
FROM node:22-slim AS dev

WORKDIR /app

# copia lock do serviço e package do serviço
COPY api/package.json ./
COPY api/package-lock.json* ./

# instala dependências
RUN npm install

# copia o código do serviço
COPY api/ ./

# roda em modo dev
CMD ["npm", "run", "dev"]

# ─── Build stage ─────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY api/package.json api/package-lock.json* ./

RUN npm install

COPY api/ ./

# ─── Production stage ─────────────────────────────────────────
FROM node:22-slim AS prod

WORKDIR /app

COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/ ./

USER node

EXPOSE 3000
CMD ["node", "index.js"]
