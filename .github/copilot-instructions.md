# Copilot Instructions

## Architecture

This is an npm workspaces monorepo for a Brazilian e-commerce store ("Tyer Store"). Three services communicate at runtime:

- **`backend/`** — Medusa v2 (2.13.1) headless commerce API. PostgreSQL + Redis. Admin dashboard at port 7001, Store API at port 9000 (exposed as 9003 locally).
- **`frontend/`** — Astro 6 SSG storefront. Fetches products from Medusa at **build time** via `getStaticPaths`. Uses `@medusajs/medusa-js` v1 client.
- **`api/`** — Express gateway (Node.js, CommonJS) that handles Mercado Pago checkout creation and payment webhooks, proxying between the frontend and Medusa.
- **`packages/`** — Shared packages (config, ui).

**Checkout flow**: Frontend → `POST /api/create-checkout` on the Express api → Mercado Pago Preference API → redirect to `init_point`. Webhooks from Mercado Pago hit `POST /api/webhook` on the api service.

**Docker networking**: Services communicate by container name. The Astro frontend reaches Medusa at `http://backend:9000` (SSR/build) and the Express api at `http://api:3000`. Locally (outside Docker): Medusa is at `http://localhost:9003`, frontend at `localhost:4321`, api at `localhost:3000`.

The frontend client (`src/lib/medusa.ts`) handles the dual URL automatically — `http://backend:9000` when `window === undefined` (build/SSR), `PUBLIC_MEDUSA_URL` otherwise.

## Commands

```bash
# Run everything (requires Docker)
docker compose up

# Backend only (from backend/)
npm run dev          # medusa develop (watch mode)
npm run build        # medusa build
npm run seed         # run seed script

# Frontend only (from frontend/)
npm run dev          # astro dev → localhost:4321
npm run build        # astro build (fetches products from Medusa at build time)

# API gateway only (from api/)
npm run dev          # node index.js → localhost:3000
```

### Backend Tests (run from `backend/`)

```bash
# Unit tests (src/**/__tests__/**/*.unit.spec.[jt]s)
npm run test:unit

# Run a single unit test file
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest --testPathPattern="path/to/test" --runInBand

# HTTP integration tests (integration-tests/http/*.spec.[jt]s)
npm run test:integration:http

# Module integration tests (src/modules/*/__tests__/**/*.ts)
npm run test:integration:modules
```

## Backend Conventions (Medusa v2)

- **File-system routing**: API routes live in `src/api/` and are auto-registered. Use named exports (`GET`, `POST`, etc.) with `MedusaRequest`/`MedusaResponse` from `@medusajs/framework/http`.
- **Custom modules** go in `src/modules/`. Each module needs an `index.ts` exporting the module definition.
- **Links** between modules live in `src/links/`.
- **Workflows** (multi-step business logic) in `src/workflows/`.
- **Subscribers** (event listeners) in `src/subscribers/`.
- **Scheduled jobs** in `src/jobs/`.
- The `medusa-config.js` uses `defineConfig` from `@medusajs/framework/utils` and loads `.env` automatically.
- File storage is configured via `@medusajs/file-s3` (compatible with MinIO for local dev).

## Frontend Conventions (Astro)

- The store UI is in **Brazilian Portuguese** (e.g., "Finalizar Compra", "Nossos Produtos").
- Product pages use `getStaticPaths` — adding new routes requires a Medusa instance running at build time.
- The `PUBLIC_` prefix on env vars makes them available client-side in Astro (`import.meta.env.PUBLIC_*`).
- `PUBLIC_API_URL` points to the Express gateway for checkout; `PUBLIC_MEDUSA_URL` points to Medusa for the JS client.
- The `CheckoutButton` component passes items as a `data-items` JSON attribute and calls the api gateway from a `<script>` tag (client-side only).

## Environment Variables

Copy `.env.example` to `.env` at the repo root. Key vars:
- `DATABASE_URL`, `REDIS_URL` — set automatically when using Docker Compose
- `MERCADOPAGO_ACCESS_TOKEN` — required for checkout to work
- `S3_*` / `MINIO_*` — for file/image storage
- `JWT_SECRET`, `COOKIE_SECRET` — Medusa auth

## Deployment

Push to `main` triggers the GitHub Actions workflow (`.github/workflows/deploy.yml`) which builds and pushes Docker images to Docker Hub, then deploys via `docker stack deploy` to a Docker Swarm VPS. Requires `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` secrets.
