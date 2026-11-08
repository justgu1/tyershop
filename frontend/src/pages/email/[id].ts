import type { APIRoute } from 'astro';
import { getMedusaStoreUrl, getPublishableKey } from '../../lib/medusa-env';

export const prerender = false;

const HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' };

const notFound = () =>
  new Response('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Link inválido</title><p style="font-family:sans-serif;text-align:center;margin:80px 20px">Link inválido. Escreva para suporte@tyershop.com.</p>', {
    status: 404,
    headers: HEADERS,
  });

// Página pública do e-mail: o servidor do site chama o Medusa e repassa IP e local do visitante para o registro da visualização.
export const GET: APIRoute = async ({ params, url, request, clientAddress }) => {
  const token = url.searchParams.get('t') ?? '';
  if (!params.id || !token) return notFound();
  const h = request.headers;
  try {
    const res = await fetch(`${getMedusaStoreUrl()}/store/emails/${encodeURIComponent(params.id)}/view`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-publishable-api-key': getPublishableKey() },
      body: JSON.stringify({
        token,
        ip: h.get('cf-connecting-ip') ?? clientAddress,
        user_agent: h.get('user-agent'),
        country: h.get('cf-ipcountry'),
        city: h.get('cf-ipcity'),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.status >= 400 && res.status < 500) return notFound();
    if (!res.ok) return new Response('Tente de novo em instantes.', { status: 503, headers: HEADERS });
    const { html } = (await res.json()) as { html: string };
    return new Response(html, { status: 200, headers: HEADERS });
  } catch {
    return new Response('Tente de novo em instantes.', { status: 503, headers: HEADERS });
  }
};
