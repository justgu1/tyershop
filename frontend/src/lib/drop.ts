import { getMedusaStoreUrl, getPublishableKey } from './medusa-env';
import { getProductListQueryString, resolveDefaultRegionId } from './medusa-pricing';

export type DropPhase = 'coming_soon' | 'presale' | 'general' | 'ended';

/** granted: pode ver e comprar · login: pré-venda sem sessão · locked: logado sem convite · none: fora de venda */
export type DropAccess = 'granted' | 'login' | 'locked' | 'none';

export type PublicDrop = {
  id: string;
  handle: string;
  title: string;
  subtitle: string | null;
  phase: DropPhase;
  next_phase_at: string | null;
  preorder_starts_at: string;
  preorder_ends_at: string;
  general_starts_at: string | null;
  general_ends_at: string;
  production_days: number;
  component_key: string | null;
  hero_kind: 'community_video' | 'drop_video' | 'banner';
  hero_url: string | null;
  cover_url: string | null;
  instagram_url: string | null;
  whatsapp_url: string | null;
};

export type DropPayload = {
  drop: PublicDrop | null;
  previous: PublicDrop[];
  access: DropAccess;
  product_ids: string[];
};

const EMPTY: DropPayload = { drop: null, previous: [], access: 'none', product_ids: [] };

export async function fetchDrops(token?: string): Promise<DropPayload> {
  try {
    const res = await fetch(`${getMedusaStoreUrl()}/store/drop`, {
      headers: {
        'x-publishable-api-key': getPublishableKey(),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return EMPTY;
    const data = await res.json();
    return {
      drop: data.drop ?? null,
      previous: data.previous ?? [],
      access: data.access ?? 'none',
      product_ids: data.product_ids ?? [],
    };
  } catch {
    return EMPTY;
  }
}

/** Produtos completos (preço, variantes, estoque) na ordem em que foram pedidos. */
export async function fetchProductsByIds(ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  try {
    const url = getMedusaStoreUrl();
    const headers = { 'x-publishable-api-key': getPublishableKey() };
    const regionId = await resolveDefaultRegionId(url, headers);
    const query = `${ids.map((id) => `id[]=${encodeURIComponent(id)}`).join('&')}&${getProductListQueryString(regionId)}&limit=${ids.length}`;
    const res = await fetch(`${url}/store/products?${query}`, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const { products = [] } = await res.json();
    const byId = new Map<string, any>(products.map((p: any) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  } catch {
    return [];
  }
}

/** Linha fixa Starter: produtos da coleção configurada, sempre à venda (esgotado aparece como esgotado). */
export async function fetchStarterProducts(limit = 12): Promise<any[]> {
  try {
    const handle = process.env.STARTER_COLLECTION_HANDLE || 'tyer-starter';
    const url = getMedusaStoreUrl();
    const headers = { 'x-publishable-api-key': getPublishableKey() };
    const cRes = await fetch(`${url}/store/collections?handle=${encodeURIComponent(handle)}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!cRes.ok) return [];
    const collection = (await cRes.json()).collections?.[0];
    if (!collection) return [];

    const regionId = await resolveDefaultRegionId(url, headers);
    const query = `collection_id[]=${collection.id}&${getProductListQueryString(regionId)}&limit=${limit}`;
    const pRes = await fetch(`${url}/store/products?${query}`, { headers, signal: AbortSignal.timeout(8000) });
    return pRes.ok ? ((await pRes.json()).products ?? []) : [];
  } catch {
    return [];
  }
}

export const PHASE_LABEL: Record<DropPhase, string> = {
  coming_soon: 'Em breve',
  presale: 'Pré-venda',
  general: 'Venda geral',
  ended: 'Encerrado',
};
