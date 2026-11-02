import { getMedusaStoreUrl, getPublishableKey } from './medusa-env';
import { cached } from './ssr-cache';

export type Collection = { id: string; title: string; handle: string; products_count?: number };

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const HIDDEN_WORDS = ['paris', 'five', 'mvp'];
const HIDDEN_PHRASES = ['red-rose'];

/** Drops que saíram do site; vale tanto pelo título quanto pelo handle. */
export const isHiddenCollection = (c: { title?: string; handle?: string }) =>
  [c.title, c.handle].some((v) => {
    const n = norm(v ?? '');
    return n.split('-').some((w) => HIDDEN_WORDS.includes(w)) || HIDDEN_PHRASES.some((p) => n.includes(p));
  });

async function loadVisibleCollections(): Promise<Collection[]> {
  const res = await fetch(`${getMedusaStoreUrl()}/store/collections?limit=50`, {
    headers: { 'x-publishable-api-key': getPublishableKey() },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`coleções: ${res.status}`);
  return ((await res.json()).collections ?? []).filter((c: Collection) => !isHiddenCollection(c));
}

export async function fetchVisibleCollections(): Promise<Collection[]> {
  try {
    return await cached('collections', 60_000, loadVisibleCollections);
  } catch {
    return [];
  }
}

/** Coleções com a contagem de produtos de cada uma (a home mostra "N itens disponíveis"). */
export async function fetchCollectionsWithCounts(): Promise<Collection[]> {
  return cached('collections:counts', 60_000, async () => {
    const collections = (await fetchVisibleCollections()).map((c) => ({ ...c }));
    const headers = { 'x-publishable-api-key': getPublishableKey() };
    const counts = await Promise.all(
      collections.map((c) =>
        fetch(`${getMedusaStoreUrl()}/store/products?collection_id[]=${c.id}&limit=1&fields=id`, { headers, signal: AbortSignal.timeout(3000) })
          .then((r) => r.json())
          .then((d) => d.count || 0)
          .catch(() => 0)
      )
    );
    collections.forEach((c, i) => (c.products_count = counts[i]));
    return collections;
  }, (v) => v.length > 0);
}
