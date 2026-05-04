import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Inside Docker dev: the backend is reachable at http://backend:9000
const MEDUSA_INTERNAL =
  process.env.MEDUSA_INTERNAL_URL ||
  process.env.MEDUSA_URL ||
  process.env.PUBLIC_MEDUSA_URL ||
  'http://localhost:9003';
/** No Docker, o browser não usa isto; o dev server do Vite usa para proxy `/api` → serviço `api`. */
const API_GATEWAY =
  process.env.INTERNAL_API_URL || process.env.PUBLIC_API_URL || 'http://localhost:3000';

const MEDUSA_PROXY = {
  '/store': {
    target: MEDUSA_INTERNAL,
    changeOrigin: true,
  },
  '/auth': {
    target: MEDUSA_INTERNAL,
    changeOrigin: true,
  },
  '/admin': {
    target: MEDUSA_INTERNAL,
    changeOrigin: true,
  },
  '/api': {
    target: API_GATEWAY.replace(/\/$/, ''),
    changeOrigin: true,
  },
};

export default defineConfig({
  site: 'https://tyer.com.br',
  adapter: node({ mode: 'standalone' }),
  integrations: [],
  i18n: {
    defaultLocale: 'pt',
    locales: ['pt'],
    routing: { prefixDefaultLocale: false },
  },
  server: { host: true, port: 4321 },
  image: {
    remotePatterns: [{ protocol: 'https' }, { protocol: 'http' }],
  },
  vite: {
    server: {
      proxy: MEDUSA_PROXY,
    },
    preview: {
      proxy: MEDUSA_PROXY,
    },
  },
});

