import { getMedusaStoreUrl, getPublishableKey } from './medusa-env';
import { cached } from './ssr-cache';
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

export type DropSection = {
  key: string;
  title: string;
  label: string | null;
  banner_url: string | null;
  banner_mobile_url: string | null;
  product_ids: string[];
};

export type DropPayload = {
  drop: PublicDrop | null;
  previous: PublicDrop[];
  access: DropAccess;
  product_ids: string[];
  sections: DropSection[];
};

const EMPTY: DropPayload = { drop: null, previous: [], access: 'none', product_ids: [], sections: [] };

export async function fetchDrops(token?: string): Promise<DropPayload> {
  // Sem conta o resultado é igual para todos: vale guardar por alguns segundos (a fase muda por data, e o cronômetro recarrega a página).
  if (!token) return cached('drops:anon', 10_000, () => fetchDropsUncached(), (v) => v !== EMPTY);
  return fetchDropsUncached(token);
}

async function fetchDropsUncached(token?: string): Promise<DropPayload> {
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
      sections: data.sections ?? [],
    };
  } catch {
    return EMPTY;
  }
}

/** Produtos completos (preço, variantes, estoque) na ordem em que foram pedidos. */
export async function fetchProductsByIds(ids: string[], token?: string): Promise<any[]> {
  if (!ids.length) return [];
  // Os ids só chegam aqui para quem o servidor já liberou, e os produtos são os mesmos para todos eles: a lista do drop
  // fica em cache curto. Só guarda se vier completa (uma sessão vencida devolveria menos produtos e não pode ficar valendo).
  return cached(`products:${[...ids].sort().join(',')}`, 30_000, () => fetchProductsByIdsUncached(ids, token), (v) => v.length === ids.length);
}

async function fetchProductsByIdsUncached(ids: string[], token?: string): Promise<any[]> {
  try {
    const url = getMedusaStoreUrl();
    const headers: Record<string, string> = {
      'x-publishable-api-key': getPublishableKey(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
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

/** Linha fixa Starter, na ordem do catálogo: sempre à venda (esgotado aparece como esgotado). */
const STARTER_HANDLES = ['regata-savage-mode', 'shorts-tyer-pro', 'camiseta-tyer-starter-dry-fit'];

/** Peças da linha Starter em reestoque, mostradas na /drop (aberta a todos: Starter tem estoque físico). */
const RESTOCK_HANDLES = ['camiseta-tyer-starter-dry-fit'];

export async function fetchStarterProducts(handles = STARTER_HANDLES): Promise<any[]> {
  return cached(`starter:${handles.join(',')}`, 30_000, () => fetchStarterUncached(handles), (v) => v.length > 0);
}

export const fetchRestockProducts = () => fetchStarterProducts(RESTOCK_HANDLES);

async function fetchStarterUncached(handles: string[]): Promise<any[]> {
  try {
    const url = getMedusaStoreUrl();
    const headers = { 'x-publishable-api-key': getPublishableKey() };
    const regionId = await resolveDefaultRegionId(url, headers);
    const handleQuery = handles.map((h) => `handle[]=${encodeURIComponent(h)}`).join('&');
    const query = `${handleQuery}&${getProductListQueryString(regionId)}&limit=${handles.length}`;
    const res = await fetch(`${url}/store/products?${query}`, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const { products = [] } = await res.json();
    const byHandle = new Map<string, any>(products.map((p: any) => [p.handle, p]));
    return handles.map((h) => byHandle.get(h)).filter(Boolean);
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

/** Alvo, rótulo e CTA do cronômetro de cada fase; `target` é null quando não há contagem. */
export function dropCountdown(drop: PublicDrop) {
  // Só conta o tempo até a pré-venda abrir; depois de aberta, ninguém precisa do cronômetro de fim.
  const target = drop.phase === 'coming_soon' ? drop.preorder_starts_at : null;
  const label = drop.phase === 'coming_soon' ? 'Pré-venda abre em' : '';
  const cta = drop.phase === 'ended' ? 'Entrar na lista do próximo' : drop.phase === 'coming_soon' ? 'Quero ser avisado' : 'Ver o drop';
  return { target, label, cta };
}
