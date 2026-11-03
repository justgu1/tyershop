import { getMedusaStoreUrl, getPublishableKey } from './medusa-env';
import { cached } from './ssr-cache';

export type Collection = { id: string; title: string; handle: string; products_count?: number; metadata?: Record<string, unknown> | null };

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const HIDDEN_WORDS = ['paris', 'five', 'mvp'];
const HIDDEN_PHRASES = ['red-rose'];

/** Drops que saíram do site (pelo título ou handle) e coleções da pré-venda, que só aparecem em /drop (metadata.pre_venda). */
export const isHiddenCollection = (c: { title?: string; handle?: string; metadata?: Record<string, unknown> | null }) =>
  c.metadata?.pre_venda === true ||
  [c.title, c.handle].some((v) => {
    const n = norm(v ?? '');
    return n.split('-').some((w) => HIDDEN_WORDS.includes(w)) || HIDDEN_PHRASES.some((p) => n.includes(p));
  });

/** Coleção sem produto à venda não aparece: rascunho, esgotada de vez ou só com produto de pré-venda fechada. */
async function loadVisibleCollections(): Promise<Collection[]> {
  const headers = { 'x-publishable-api-key': getPublishableKey() };
  const res = await fetch(`${getMedusaStoreUrl()}/store/collections?limit=50&fields=id,title,handle,metadata`, { headers, signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`coleções: ${res.status}`);
  const collections: Collection[] = ((await res.json()).collections ?? []).filter((c: Collection) => !isHiddenCollection(c));
  const counts = await Promise.all(
    collections.map((c) =>
      // `count` da Store API inclui produtos que o servidor esconde (pré-venda fechada): conta o que de fato veio.
      fetch(`${getMedusaStoreUrl()}/store/products?collection_id[]=${c.id}&limit=100&fields=id`, { headers, signal: AbortSignal.timeout(3000) })
        .then((r) => r.json())
        .then((d) => (d.products ?? []).length)
        .catch(() => 0)
    )
  );
  return collections.map((c, i) => ({ ...c, products_count: counts[i] })).filter((c) => (c.products_count ?? 0) > 0);
}

export async function fetchVisibleCollections(): Promise<Collection[]> {
  try {
    return await cached('collections', 60_000, loadVisibleCollections);
  } catch {
    return [];
  }
}

/** Coleções com a contagem de produtos de cada uma (a home mostra "N itens disponíveis"). */
export const fetchCollectionsWithCounts = fetchVisibleCollections;
