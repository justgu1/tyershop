import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  const headers = response.headers;
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'SAMEORIGIN');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  if (import.meta.env.PROD) headers.set('strict-transport-security', 'max-age=31536000');
  return response;
});
