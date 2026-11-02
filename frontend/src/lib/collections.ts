import { getMedusaStoreUrl, getPublishableKey } from './medusa-env';

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

export async function fetchVisibleCollections(): Promise<Collection[]> {
  try {
    const res = await fetch(`${getMedusaStoreUrl()}/store/collections?limit=50`, {
      headers: { 'x-publishable-api-key': getPublishableKey() },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    return ((await res.json()).collections ?? []).filter((c: Collection) => !isHiddenCollection(c));
  } catch {
    return [];
  }
}
