import { defineMiddleware } from 'astro:middleware';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
// O clique único de descadastro vem do cliente de e-mail, sem Origin; o link já traz um token assinado que o autentica.
const NO_ORIGIN_CHECK = ['/sair-da-lista'];

/** Origem do site como o navegador a vê: atrás do proxy TLS o `url.origin` do servidor seria http. */
function siteOrigin(request: Request, url: URL) {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || request.headers.get('host') || url.host;
  return `${proto}://${host}`;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (!SAFE_METHODS.has(request.method) && FORM_TYPES.some((t) => type.startsWith(t)) && !NO_ORIGIN_CHECK.some((p) => url.pathname.startsWith(p))) {
    if (request.headers.get('origin') !== siteOrigin(request, url)) {
      return new Response('Origem não permitida', { status: 403 });
    }
  }

  const response = await next();
  const headers = response.headers;
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'SAMEORIGIN');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  if (import.meta.env.PROD) headers.set('strict-transport-security', 'max-age=31536000');
  return response;
});
