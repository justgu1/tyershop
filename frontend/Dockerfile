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

# ─── Production stage ─────────────────────────────────────────
# adapter é @astrojs/node standalone (SSR: dist/client + dist/server/entry.mjs)
# não é site estático — nginx servindo dist/ direto só mostra a página default
# dele, porque não existe dist/index.html (rota real fica em dist/client/)
FROM node:22-slim AS prod

WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=8080

COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

USER node

EXPOSE 8080
CMD ["node", "./dist/server/entry.mjs"]
