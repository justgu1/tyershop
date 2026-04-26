# ─── Dev stage ───────────────────────────────────────────────
FROM node:22-slim AS dev

WORKDIR /app

# copia lock do serviço e package do serviço
COPY frontend/package.json ./
COPY frontend/package-lock.json* ./

# instala dependências
RUN npm install

# copia o código do serviço
COPY frontend/ ./

# roda em modo dev
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ─── Build stage ─────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json* ./

RUN npm install

COPY frontend/ ./

RUN npm run build

# ─── Production stage (Nginx) ─────────────────────────────────
FROM nginx:alpine AS prod

COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
